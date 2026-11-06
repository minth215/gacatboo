-- =====================================================================
-- 0104: 멤버별 정기 입금/총대 정기 결제 설정 보완
--   · 반복 시작일 = 멤버의 그룹 시작일자, 종료일 = 멤버 종료일자. 멤버 시작/종료일자를 바꾸면
--     그 멤버의 입금 반복(총대는 그룹 결제 반복)의 시작/종료일도 함께 맞춤(trigger)
--   · 총대와 해당 멤버 모두 입금 반복을 수정할 수 있게(update 정책 추가)
--   · 자동 생성되는 멤버 지출 기록의 원천이 비어 있으면 멤버의 그룹 출금 수단으로,
--     분류 이모지는 멤버 본인의 같은 이름 지출 분류 이모지로
--   · backfill_group_rule — 기록이 없는 지난 회차 일괄 생성(같은 달(연)에 이 반복이 아닌 기록이 있으면 건너뜀)
--   · group_recurring_schedule 에 next_date(영업일 보정·선입금 반영한 다음 회차) 추가
-- 0001~0103 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- ---------- 반복일 판정(생성 없이) ----------
create or replace function public.recurring_is_due(r public.recurring_rules, check_date date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  due boolean := false;
  months_since int; years_since int;
  week_start_rule date; week_start_check date; weeks_since int;
  target_day int; i int; cand_month date; cand_year int; nominal_date date; adj_date date;
begin
  if check_date < r.start_date then return false; end if;
  if r.end_date is not null and check_date > r.end_date then return false; end if;
  -- 반복 시작일 회차는 반복을 등록한 원래 기록이 담당하므로 자동으로 만들지 않는다
  -- (반복 등록 시 반복 날짜를 기록 날짜와 다르게 지정한 경우, 그 달/해의 회차가 중복 생성되지 않게).
  -- (정기 입금 설정처럼 기록 없이 규칙만 만든 경우(generate_on_start)는 시작일 회차도 생성)
  if check_date = r.start_date and not coalesce(r.generate_on_start, false) then return false; end if;

  if r.freq_unit = 'day' then
    due := ((check_date - r.start_date) % r.freq_interval) = 0;

  elsif r.freq_unit = 'week' then
    week_start_rule := r.start_date - extract(dow from r.start_date)::int;
    week_start_check := check_date - extract(dow from check_date)::int;
    weeks_since := (week_start_check - week_start_rule) / 7;
    due := (weeks_since % r.freq_interval = 0) and (extract(dow from check_date)::int = any(r.weekdays));

  elsif r.freq_unit = 'month' then
    for i in -1..1 loop
      cand_month := (date_trunc('month', check_date) + make_interval(months => i))::date;
      months_since := (extract(year from cand_month)::int - extract(year from r.start_date)::int) * 12
                     + (extract(month from cand_month)::int - extract(month from r.start_date)::int);
      if months_since >= 0 and months_since % r.freq_interval = 0 then
        target_day := least(
          extract(day from r.start_date)::int,
          extract(day from (cand_month + interval '1 month - 1 day'))::int
        );
        nominal_date := cand_month + (target_day - 1);
        adj_date := public.adjust_business_day(nominal_date, r.business_day_rule);
        if adj_date = check_date then due := true; end if;
      end if;
    end loop;

  elsif r.freq_unit = 'year' then
    for i in -1..1 loop
      cand_year := extract(year from check_date)::int + i;
      years_since := cand_year - extract(year from r.start_date)::int;
      if years_since >= 0 and years_since % r.freq_interval = 0 then
        target_day := least(
          extract(day from r.start_date)::int,
          extract(day from (date_trunc('month', make_date(cand_year, extract(month from r.start_date)::int, 1)) + interval '1 month - 1 day'))::int
        );
        nominal_date := make_date(cand_year, extract(month from r.start_date)::int, target_day);
        adj_date := public.adjust_business_day(nominal_date, r.business_day_rule);
        if adj_date = check_date then due := true; end if;
      end if;
    end loop;
  end if;

  return due;
end;
$$;

-- 다음 회차: p_from(포함) 이후 첫 반복일(영업일 보정 반영). 2년 안에 없으면 null
create or replace function public.recurring_next_date(r public.recurring_rules, p_from date)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := greatest(p_from, r.start_date - 7);
begin
  for i in 0..800 loop
    if r.end_date is not null and d > r.end_date + 7 then return null; end if;
    if d >= p_from and public.recurring_is_due(r, d) then return d; end if;
    d := d + 1;
  end loop;
  return null;
end;
$$;

-- ---------- 그룹 결제/입금 반복 일정 + 다음 회차 ----------
drop function if exists public.group_recurring_schedule(bigint);
create or replace function public.group_recurring_schedule(p_group_id bigint)
returns table (id bigint, target text, member_id bigint, start_date date, end_date date,
               freq_unit text, freq_interval int, weekdays int[], active boolean, next_date date)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.recurring_rules;
  today date := (now() at time zone 'Asia/Seoul')::date;
  v_last date; v_periods int; v_from date; v_prepay date;
begin
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_group_owner(p_group_id, auth.uid())) then return; end if;
  for r in select * from public.recurring_rules x
    where x.group_id = p_group_id and x.active and x.target in ('subscription_payment', 'subscription_deposit')
  loop
    v_last := null; v_periods := null;
    if r.target = 'subscription_deposit' then
      select d.date, d.periods into v_last, v_periods from public.subscription_deposits d
        where d.group_id = p_group_id and d.member_id = r.member_id order by d.date desc, d.id desc limit 1;
    else
      select p.date, p.periods into v_last, v_periods from public.subscription_payments p
        where p.group_id = p_group_id order by p.date desc, p.id desc limit 1;
    end if;
    v_from := greatest(today, coalesce(v_last + 1, today));
    -- 여러 회차를 미리 낸 건이면 그만큼 지난 뒤부터(자동 생성 규칙과 동일, 허용 오차 포함)
    if v_last is not null and coalesce(v_periods, 1) > 1 then
      v_prepay := case r.freq_unit
        when 'day'  then v_last + (r.freq_interval * v_periods)
        when 'week' then v_last + (r.freq_interval * v_periods * 7) - 3
        when 'year' then (v_last + make_interval(years => r.freq_interval * v_periods))::date - 7
        else             (v_last + make_interval(months => r.freq_interval * v_periods))::date - 7
      end;
      v_from := greatest(v_from, v_prepay);
    end if;
    id := r.id; target := r.target; member_id := r.member_id; start_date := r.start_date; end_date := r.end_date;
    freq_unit := r.freq_unit; freq_interval := r.freq_interval; weekdays := r.weekdays; active := r.active;
    next_date := public.recurring_next_date(r, v_from);
    return next;
  end loop;
end;
$$;
grant execute on function public.group_recurring_schedule(bigint) to authenticated;

-- ---------- 총대·해당 멤버 모두 입금 반복 수정 가능 ----------
drop policy if exists recurring_rules_deposit_counterpart_update on public.recurring_rules;
create policy recurring_rules_deposit_counterpart_update on public.recurring_rules
  for update to authenticated
  using (public.is_deposit_rule_counterpart(id, auth.uid()))
  with check (target = 'subscription_deposit');

-- ---------- 자동 생성: 멤버 쪽 원천/분류 이모지 보완 ----------
create or replace function public.generate_recurring_occurrence(r public.recurring_rules, check_date date)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  due boolean := false;
  months_since int;
  years_since int;
  week_start_rule date;
  week_start_check date;
  weeks_since int;
  target_day int;
  new_tx_id bigint;
  new_pay_id bigint;
  v_owner_id uuid;
  v_member_uid uuid;
  v_nickname text;
  v_lcat text;
  v_lemoji text;
  new_leader_tx_id bigint;
  new_member_tx_id bigint;
  new_dep_id bigint;
  v_override date;
  v_last_date date;
  v_last_periods int;
  v_next_due date;
  i int;
  cand_month date;
  cand_year int;
  nominal_date date;
  adj_date date;
  v_group_category text;
  v_tolerance int;
  v_msrc_id bigint;
  v_msrc_name text;
  v_mcat_emoji text;
begin
  if check_date < r.start_date then return false; end if;
  if r.end_date is not null and check_date > r.end_date then return false; end if;
  -- 반복 시작일 회차는 반복을 등록한 원래 기록이 담당하므로 자동으로 만들지 않는다
  -- (반복 등록 시 반복 날짜를 기록 날짜와 다르게 지정한 경우, 그 달/해의 회차가 중복 생성되지 않게).
  -- (정기 입금 설정처럼 기록 없이 규칙만 만든 경우(generate_on_start)는 시작일 회차도 생성)
  if check_date = r.start_date and not coalesce(r.generate_on_start, false) then return false; end if;

  if r.freq_unit = 'day' then
    due := ((check_date - r.start_date) % r.freq_interval) = 0;

  elsif r.freq_unit = 'week' then
    week_start_rule := r.start_date - extract(dow from r.start_date)::int;
    week_start_check := check_date - extract(dow from check_date)::int;
    weeks_since := (week_start_check - week_start_rule) / 7;
    due := (weeks_since % r.freq_interval = 0) and (extract(dow from check_date)::int = any(r.weekdays));

  elsif r.freq_unit = 'month' then
    for i in -1..1 loop
      cand_month := (date_trunc('month', check_date) + make_interval(months => i))::date;
      months_since := (extract(year from cand_month)::int - extract(year from r.start_date)::int) * 12
                     + (extract(month from cand_month)::int - extract(month from r.start_date)::int);
      if months_since >= 0 and months_since % r.freq_interval = 0 then
        target_day := least(
          extract(day from r.start_date)::int,
          extract(day from (cand_month + interval '1 month - 1 day'))::int
        );
        nominal_date := cand_month + (target_day - 1);
        adj_date := public.adjust_business_day(nominal_date, r.business_day_rule);
        if adj_date = check_date then due := true; end if;
      end if;
    end loop;

  elsif r.freq_unit = 'year' then
    for i in -1..1 loop
      cand_year := extract(year from check_date)::int + i;
      years_since := cand_year - extract(year from r.start_date)::int;
      if years_since >= 0 and years_since % r.freq_interval = 0 then
        target_day := least(
          extract(day from r.start_date)::int,
          extract(day from (date_trunc('month', make_date(cand_year, extract(month from r.start_date)::int, 1)) + interval '1 month - 1 day'))::int
        );
        nominal_date := make_date(cand_year, extract(month from r.start_date)::int, target_day);
        adj_date := public.adjust_business_day(nominal_date, r.business_day_rule);
        if adj_date = check_date then due := true; end if;
      end if;
    end loop;
  end if;

  -- 정산 그룹은 구독 주기(다음 결제일/입금일) 개념이 없으므로 반복 규칙 날짜 그대로 생성
  select category into v_group_category from public.groups where id = r.group_id;

  -- 구독 그룹: 반복 규칙 날짜 그대로 생성하되, 다음 결제일/입금일을 직접 지정했거나(next_due_override)
  -- 마지막 결제/입금이 여러 회차를 미리 낸 건이면 그만큼(규칙 주기 × 회차) 지난 뒤부터 생성
  if due and r.target in ('subscription_payment', 'subscription_deposit') and coalesce(v_group_category, '') <> '정산' then
    if r.target = 'subscription_payment' then
      select next_due_override into v_override from public.group_members where group_id = r.group_id and role = 'owner';
      select date, periods into v_last_date, v_last_periods
        from public.subscription_payments where group_id = r.group_id and date < check_date order by date desc, id desc limit 1;
    else
      select next_due_override into v_override from public.group_members where id = r.member_id;
      select date, periods into v_last_date, v_last_periods
        from public.subscription_deposits where group_id = r.group_id and member_id = r.member_id and date < check_date order by date desc, id desc limit 1;
    end if;

    v_next_due := null;
    if v_override is not null then
      v_next_due := v_override;
    elsif v_last_date is not null and coalesce(v_last_periods, 1) > 1 then
      v_next_due := case r.freq_unit
        when 'day'  then v_last_date + (r.freq_interval * v_last_periods)
        when 'week' then v_last_date + (r.freq_interval * v_last_periods * 7)
        when 'year' then (v_last_date + make_interval(years => r.freq_interval * v_last_periods))::date
        else             (v_last_date + make_interval(months => r.freq_interval * v_last_periods))::date
      end;
    end if;

    -- 영업일 보정·말일 처리로 며칠 앞당겨지는 경우는 허용(월/연 주기 7일, 주 주기 3일)
    v_tolerance := case when v_override is not null then 0
                        when r.freq_unit in ('month', 'year') then 7
                        when r.freq_unit = 'week' then 3 else 0 end;
    if v_next_due is not null and check_date < v_next_due - v_tolerance then
      due := false;
    end if;
  end if;
  if not due then return false; end if;
  if exists (select 1 from public.transactions t where t.recurring_id = r.id and t.date = check_date) then return false; end if;

  if r.target = 'subscription_payment' then
    insert into public.transactions (
      user_id, group_id, type, date, amount, category_name, category_emoji,
      source_id, source_name, content, memo, created_by, recurring_id, input_currency, input_amount, fx_rate, exclude_performance
    ) values (
      r.user_id, null, r.type, check_date, r.amount, r.category_name, r.category_emoji,
      r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate, coalesce(r.exclude_performance, false)
    ) returning id into new_tx_id;

    insert into public.subscription_payments (
      group_id, date, amount, category_name, category_emoji, source_id, source_name,
      content, memo, tx_id, created_by, periods, recurring_id, input_currency, input_amount, fx_rate, exclude_performance
    ) values (
      r.group_id, check_date, r.amount, r.category_name, r.category_emoji, r.source_id, r.source_name,
      r.content, r.memo, new_tx_id, r.user_id, 1, r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate, coalesce(r.exclude_performance, false)
    ) returning id into new_pay_id;

    update public.transactions set origin_type = 'payment', origin_id = new_pay_id, origin_group_id = r.group_id
      where id = new_tx_id;

  elsif r.target = 'subscription_deposit' then
    select owner_id into v_owner_id from public.groups where id = r.group_id;
    select user_id, coalesce(nullif(nickname,''), '멤버') into v_member_uid, v_nickname
      from public.group_members where id = r.member_id;

    if coalesce(r.leader_category_name,'') = '' then
      v_lcat := '정산'; v_lemoji := public.group_owner_settle_emoji(r.group_id);
    else
      v_lcat := r.leader_category_name; v_lemoji := r.leader_category_emoji;
    end if;

    insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, recurring_id, input_currency, input_amount, fx_rate)
    values (v_owner_id, null, 'income', check_date, r.amount, coalesce(v_lcat,''), coalesce(v_lemoji,''),
            r.deposit_source_name, coalesce(r.content,'') || ' - ' || v_nickname, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate)
    returning id into new_leader_tx_id;

    -- 멤버 쪽 원천이 비어 있으면(총대가 대신 설정한 경우 등) 멤버가 그룹에 지정한 출금 수단으로,
    -- 분류 이모지는 멤버 본인의 같은 이름 지출 분류 이모지로
    v_msrc_id := null; v_msrc_name := coalesce(r.source_name, ''); v_mcat_emoji := coalesce(r.category_emoji, '');
    if v_member_uid is not null then
      if v_msrc_name = '' then
        select s.id, s.name into v_msrc_id, v_msrc_name
          from public.group_members gm join public.sources s on s.id = gm.withdraw_source_id and s.user_id = gm.user_id
          where gm.id = r.member_id;
        v_msrc_name := coalesce(v_msrc_name, '');
      end if;
      select coalesce(nullif(c.emoji, ''), v_mcat_emoji) into v_mcat_emoji from public.categories c
        where c.user_id = v_member_uid and c.type = 'expense' and c.name = r.category_name order by c.id limit 1;
      v_mcat_emoji := coalesce(v_mcat_emoji, r.category_emoji, '');
    end if;

    new_member_tx_id := null;
    if v_member_uid is not null then
      insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_id, source_name, content, memo, created_by, recurring_id, input_currency, input_amount, fx_rate, exclude_performance)
      values (v_member_uid, null, 'expense', check_date, r.amount, r.category_name, v_mcat_emoji, v_msrc_id, v_msrc_name, r.content, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate, coalesce(r.exclude_performance, false))
      returning id into new_member_tx_id;
    end if;

    insert into public.subscription_deposits (
      group_id, member_id, date, amount, periods, category_name, category_emoji, source_name,
      deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
      leader_category_name, leader_category_emoji, recurring_id, input_currency, input_amount, fx_rate, exclude_performance
    ) values (
      r.group_id, r.member_id, check_date, r.amount, 1, r.category_name, v_mcat_emoji, v_msrc_name,
      r.deposit_source_name, r.content, r.memo, new_leader_tx_id, new_member_tx_id, r.user_id,
      coalesce(v_lcat,''), coalesce(v_lemoji,''), r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate, coalesce(r.exclude_performance, false)
    ) returning id into new_dep_id;

    update public.transactions set origin_type = 'deposit', origin_id = new_dep_id, origin_group_id = r.group_id
      where id = new_leader_tx_id or id = new_member_tx_id;

  else
    insert into public.transactions (
      user_id, group_id, type, date, amount, category_id, category_name, category_emoji, category_color,
      source_id, source_name, to_source_id, to_source_name, content, memo, created_by, recurring_id,
      items, input_currency, input_amount, fx_rate, exclude_performance
    ) values (
      r.user_id, r.group_id, r.type, check_date, r.amount, r.category_id, r.category_name, r.category_emoji, r.category_color,
      r.source_id, r.source_name, r.to_source_id, r.to_source_name, r.content, r.memo, r.user_id, r.id,
      r.items, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate, coalesce(r.exclude_performance, false)
    );
  end if;

  return true;
end;
$$;

-- ---------- 지난 회차 일괄 생성(기록이 없는 회차만) ----------
create or replace function public.backfill_group_rule(p_rule_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_rules;
  today date := (now() at time zone 'Asia/Seoul')::date;
  d date; v_until date; n int := 0; v_covered boolean;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if not found then raise exception '반복 규칙을 찾을 수 없습니다.'; end if;
  if r.target not in ('subscription_deposit', 'subscription_payment') then raise exception '그룹 결제/입금 반복만 가능합니다.'; end if;
  if r.user_id <> auth.uid() and not public.is_deposit_rule_counterpart(r.id, auth.uid())
     and not public.is_group_owner(r.group_id, auth.uid()) then
    raise exception '권한이 없습니다.';
  end if;
  v_until := least(today, coalesce(r.end_date, today));
  d := r.start_date;
  while d <= v_until loop
    if r.target = 'subscription_deposit' then
      v_covered := exists (select 1 from public.subscription_deposits x where x.group_id = r.group_id and x.member_id = r.member_id
        and x.recurring_id is distinct from r.id and case r.freq_unit when 'month' then date_trunc('month', x.date) = date_trunc('month', d)
                             when 'year' then date_trunc('year', x.date) = date_trunc('year', d)
                             else x.date = d end);
    else
      v_covered := exists (select 1 from public.subscription_payments x where x.group_id = r.group_id
        and x.recurring_id is distinct from r.id and case r.freq_unit when 'month' then date_trunc('month', x.date) = date_trunc('month', d)
                             when 'year' then date_trunc('year', x.date) = date_trunc('year', d)
                             else x.date = d end);
    end if;
    if not v_covered and public.generate_recurring_occurrence(r, d) then n := n + 1; end if;
    d := d + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.backfill_group_rule(bigint) to authenticated;

-- 새 규칙의 오늘 회차 바로 생성: 총대의 그룹 결제 반복도 허용
create or replace function public.run_recurring_rule_today(p_rule_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_rules;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if not found then return false; end if;
  if r.user_id <> auth.uid() and not public.is_deposit_rule_counterpart(r.id, auth.uid())
     and not (r.group_id is not null and public.is_group_owner(r.group_id, auth.uid())) then
    raise exception '권한이 없습니다.';
  end if;
  if not r.active or today < r.start_date or (r.end_date is not null and today > r.end_date) then return false; end if;
  return public.generate_recurring_occurrence(r, today);
end;
$$;
grant execute on function public.run_recurring_rule_today(bigint) to authenticated;

-- ---------- 멤버 시작/종료일자 → 반복 시작/종료일 ----------
-- 새 시작일 기준으로 반복 일자(월/연의 일자)는 유지하고, 시작일 이전이면 다음 주기로
create or replace function public.recurring_align_start(p_old date, p_new date, p_unit text, p_interval int)
returns date language plpgsql immutable as $$
declare cand date; y int; m int;
begin
  if p_new is null then return p_old; end if;
  if p_unit = 'month' then
    for i in 0..24 loop
      cand := (date_trunc('month', p_new) + make_interval(months => i * greatest(p_interval, 1)))::date;
      cand := cand + (least(extract(day from p_old)::int, extract(day from (cand + interval '1 month - 1 day'))::int) - 1);
      if cand >= p_new then return cand; end if;
    end loop;
    return p_new;
  elsif p_unit = 'year' then
    m := extract(month from p_old)::int;
    for i in 0..10 loop
      y := extract(year from p_new)::int + i * greatest(p_interval, 1);
      cand := make_date(y, m, 1);
      cand := cand + (least(extract(day from p_old)::int, extract(day from (cand + interval '1 month - 1 day'))::int) - 1);
      if cand >= p_new then return cand; end if;
    end loop;
    return p_new;
  end if;
  return p_new;
end;
$$;

create or replace function public.sync_member_rule_dates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.end_date is distinct from OLD.end_date then
    update public.recurring_rules r set end_date = NEW.end_date
    where (r.target = 'subscription_deposit' and r.member_id = NEW.id)
       or (NEW.role = 'owner' and r.target = 'subscription_payment' and r.group_id = NEW.group_id);
  end if;
  if NEW.start_date is distinct from OLD.start_date and NEW.start_date is not null then
    update public.recurring_rules r set start_date = public.recurring_align_start(r.start_date, NEW.start_date, r.freq_unit, r.freq_interval)
    where (r.target = 'subscription_deposit' and r.member_id = NEW.id)
       or (NEW.role = 'owner' and r.target = 'subscription_payment' and r.group_id = NEW.group_id);
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_sync_member_rule_dates on public.group_members;
create trigger trg_sync_member_rule_dates after update of start_date, end_date on public.group_members
  for each row execute function public.sync_member_rule_dates();
