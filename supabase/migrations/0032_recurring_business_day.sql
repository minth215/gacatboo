-- =====================================================================
-- 0032: 반복 항목의 영업일 보정(전 영업일/후 영업일)
--   · recurring_rules.business_day_rule — 'none'(기본, 보정 없음) | 'before'(전 영업일로
--     당김) | 'after'(후 영업일로 미룸). 월/연 반복에만 의미가 있음(일/주 반복은 무시).
--   · "영업일"은 토/일요일만 제외한 평일 기준(공휴일 달력은 없어 반영하지 않음).
--   · 예: 매월 25일 반복에 전 영업일 설정 + 25일이 일요일이면 23일(금)에, 후 영업일이면
--     26일(월)에 생성됨.
--   · 보정으로 날짜가 전/다음 달(또는 해/다음 해)로 넘어가는 경계 케이스(예: 1일이 토요일이고
--     전 영업일 설정이면 지난달 마지막 평일로 당겨짐)까지 맞게 처리하기 위해, 이번 달/연도뿐
--     아니라 전·다음 달/연도 기준의 명목일도 함께 확인한다.
-- 0001~0031 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists business_day_rule text not null default 'none';
alter table public.recurring_rules drop constraint if exists recurring_rules_business_day_rule_check;
alter table public.recurring_rules add constraint recurring_rules_business_day_rule_check
  check (business_day_rule in ('none', 'before', 'after'));

create or replace function public.adjust_business_day(d date, rule text)
returns date language sql immutable as $$
  select case
    when rule = 'before' and extract(dow from d)::int = 0 then d - 2  -- 일요일 → 전 금요일
    when rule = 'before' and extract(dow from d)::int = 6 then d - 1  -- 토요일 → 전 금요일
    when rule = 'after'  and extract(dow from d)::int = 0 then d + 1  -- 일요일 → 다음 월요일
    when rule = 'after'  and extract(dow from d)::int = 6 then d + 2  -- 토요일 → 다음 월요일
    else d
  end;
$$;

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
  v_billing_day int;
  v_period_unit text;
  v_period_count int;
  v_override date;
  v_last_date date;
  v_last_periods int;
  v_base date;
  v_next_due date;
  i int;
  cand_month date;
  cand_year int;
  nominal_date date;
  adj_date date;
begin
  if check_date < r.start_date then return false; end if;
  if r.end_date is not null and check_date > r.end_date then return false; end if;

  if r.freq_unit = 'day' then
    due := ((check_date - r.start_date) % r.freq_interval) = 0;

  elsif r.freq_unit = 'week' then
    week_start_rule := r.start_date - extract(dow from r.start_date)::int;
    week_start_check := check_date - extract(dow from check_date)::int;
    weeks_since := (week_start_check - week_start_rule) / 7;
    due := (weeks_since % r.freq_interval = 0) and (extract(dow from check_date)::int = any(r.weekdays));

  elsif r.freq_unit = 'month' then
    -- 영업일 보정이 날짜를 전/다음 달로 밀어낼 수 있어, 이번 달뿐 아니라 전/다음 달 기준
    -- 명목일도 함께 확인한다(보정 폭은 최대 2일이라 인접한 달까지만 보면 충분).
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

  if due and r.target in ('subscription_payment', 'subscription_deposit') then
    select billing_day, period_unit, period_count into v_billing_day, v_period_unit, v_period_count
      from public.subscriptions where group_id = r.group_id;

    if r.target = 'subscription_payment' then
      select next_due_override into v_override from public.group_members where group_id = r.group_id and role = 'owner';
      select date, periods into v_last_date, v_last_periods
        from public.subscription_payments where group_id = r.group_id and date < check_date order by date desc, id desc limit 1;
    else
      select next_due_override into v_override from public.group_members where id = r.member_id;
      select date, periods into v_last_date, v_last_periods
        from public.subscription_deposits where group_id = r.group_id and member_id = r.member_id and date < check_date order by date desc, id desc limit 1;
    end if;

    if v_override is not null then
      v_next_due := v_override;
    elsif v_last_date is not null and v_period_unit is not null then
      v_base := date_trunc('month', v_last_date)::date
        + (least(coalesce(v_billing_day, extract(day from v_last_date)::int),
                 extract(day from (date_trunc('month', v_last_date) + interval '1 month - 1 day'))::int) - 1);
      v_next_due := case v_period_unit
        when 'day'  then v_base + (coalesce(v_period_count, 1) * coalesce(v_last_periods, 1))
        when 'week' then v_base + (coalesce(v_period_count, 1) * coalesce(v_last_periods, 1) * 7)
        when 'year' then (v_base + make_interval(years => coalesce(v_period_count, 1) * coalesce(v_last_periods, 1)))::date
        else             (v_base + make_interval(months => coalesce(v_period_count, 1) * coalesce(v_last_periods, 1)))::date
      end;
    else
      v_next_due := null;
    end if;

    if v_next_due is not null and check_date < v_next_due then
      due := false;
    end if;
  end if;

  if not due then return false; end if;
  if exists (select 1 from public.transactions t where t.recurring_id = r.id and t.date = check_date) then return false; end if;

  if r.target = 'subscription_payment' then
    insert into public.transactions (
      user_id, group_id, type, date, amount, category_name, category_emoji,
      source_id, source_name, content, memo, created_by, recurring_id
    ) values (
      r.user_id, null, r.type, check_date, r.amount, r.category_name, r.category_emoji,
      r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id
    ) returning id into new_tx_id;

    insert into public.subscription_payments (
      group_id, date, amount, category_name, category_emoji, source_id, source_name,
      content, memo, tx_id, created_by, periods, recurring_id
    ) values (
      r.group_id, check_date, r.amount, r.category_name, r.category_emoji, r.source_id, r.source_name,
      r.content, r.memo, new_tx_id, r.user_id, 1, r.id
    ) returning id into new_pay_id;

    update public.transactions set origin_type = 'payment', origin_id = new_pay_id, origin_group_id = r.group_id
      where id = new_tx_id;

  elsif r.target = 'subscription_deposit' then
    select owner_id into v_owner_id from public.groups where id = r.group_id;
    select user_id, coalesce(nullif(nickname,''), '멤버') into v_member_uid, v_nickname
      from public.group_members where id = r.member_id;

    if coalesce(r.leader_category_name,'') = '' then
      select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'')
        into v_lcat, v_lemoji from public.subscriptions where group_id = r.group_id;
    else
      v_lcat := r.leader_category_name; v_lemoji := r.leader_category_emoji;
    end if;

    insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, recurring_id)
    values (v_owner_id, null, 'income', check_date, r.amount, coalesce(v_lcat,''), coalesce(v_lemoji,''),
            r.deposit_source_name, coalesce(r.content,'') || ' - ' || v_nickname, r.memo, r.user_id, r.id)
    returning id into new_leader_tx_id;

    new_member_tx_id := null;
    if v_member_uid is not null then
      insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, recurring_id)
      values (v_member_uid, null, 'expense', check_date, r.amount, r.category_name, r.category_emoji, r.source_name, r.content, r.memo, r.user_id, r.id)
      returning id into new_member_tx_id;
    end if;

    insert into public.subscription_deposits (
      group_id, member_id, date, amount, periods, category_name, category_emoji, source_name,
      deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
      leader_category_name, leader_category_emoji, recurring_id
    ) values (
      r.group_id, r.member_id, check_date, r.amount, 1, r.category_name, r.category_emoji, r.source_name,
      r.deposit_source_name, r.content, r.memo, new_leader_tx_id, new_member_tx_id, r.user_id,
      coalesce(v_lcat,''), coalesce(v_lemoji,''), r.id
    ) returning id into new_dep_id;

    update public.transactions set origin_type = 'deposit', origin_id = new_dep_id, origin_group_id = r.group_id
      where id = new_leader_tx_id or id = new_member_tx_id;

  else
    insert into public.transactions (
      user_id, group_id, type, date, amount, category_id, category_name, category_emoji, category_color,
      source_id, source_name, content, memo, created_by, recurring_id
    ) values (
      r.user_id, r.group_id, r.type, check_date, r.amount, r.category_id, r.category_name, r.category_emoji, r.category_color,
      r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id
    );
  end if;

  return true;
end;
$$;
