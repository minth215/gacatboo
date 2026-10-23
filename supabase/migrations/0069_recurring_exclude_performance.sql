-- =====================================================================
-- 0069: 반복에도 카드 "실적 제외" 반영
--   · recurring_rules.exclude_performance — 실적 제외로 기록한 항목에 반복을 걸면 규칙에 함께 저장하고,
--     자동으로 등록되는 회차(개인 기록·그룹 결제·그룹 입금의 멤버 지출)도 항상 실적 제외로 만든다.
--   · 이미 있던 규칙은 그 규칙으로 처음 저장된 기록이 실적 제외였으면 실적 제외로 채운다.
-- 0001~0068 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists exclude_performance boolean not null default false;

update public.recurring_rules r set exclude_performance = true
where not r.exclude_performance and exists (
  select 1 from public.transactions t where t.recurring_id = r.id and t.exclude_performance
);

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
  v_group_category text;
  v_tolerance int;
begin
  if check_date < r.start_date then return false; end if;
  if r.end_date is not null and check_date > r.end_date then return false; end if;
  -- 반복 시작일 회차는 반복을 등록한 원래 기록이 담당하므로 자동으로 만들지 않는다
  -- (반복 등록 시 반복 날짜를 기록 날짜와 다르게 지정한 경우, 그 달/해의 회차가 중복 생성되지 않게).
  if check_date = r.start_date then return false; end if;

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

  if due and r.target in ('subscription_payment', 'subscription_deposit') and coalesce(v_group_category, '') <> '정산' then
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
      -- 다음 결제일/입금일 = 마지막 결제(입금)일 + 그 건이 커버한 회차만큼의 주기.
      -- (예전엔 정기결제일(billing_day)에 맞춘 날짜를 기준으로 삼아, 반복 날짜가 정기결제일과 다르면
      --  매번 "아직 다음 결제일 전"으로 판단돼 영원히 생성되지 않는 문제가 있었음)
      v_base := v_last_date;
      v_next_due := case v_period_unit
        when 'day'  then v_base + (coalesce(v_period_count, 1) * coalesce(v_last_periods, 1))
        when 'week' then v_base + (coalesce(v_period_count, 1) * coalesce(v_last_periods, 1) * 7)
        when 'year' then (v_base + make_interval(years => coalesce(v_period_count, 1) * coalesce(v_last_periods, 1)))::date
        else             (v_base + make_interval(months => coalesce(v_period_count, 1) * coalesce(v_last_periods, 1)))::date
      end;
    else
      v_next_due := null;
    end if;

    -- 영업일 보정·말일 처리로 며칠 앞당겨지는 경우는 허용(월/연 주기 7일, 주 주기 3일)
    v_tolerance := case when v_override is not null then 0
                        when v_period_unit in ('month', 'year') then 7
                        when v_period_unit = 'week' then 3 else 0 end;
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
      select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'')
        into v_lcat, v_lemoji from public.subscriptions where group_id = r.group_id;
    else
      v_lcat := r.leader_category_name; v_lemoji := r.leader_category_emoji;
    end if;

    insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, recurring_id, input_currency, input_amount, fx_rate)
    values (v_owner_id, null, 'income', check_date, r.amount, coalesce(v_lcat,''), coalesce(v_lemoji,''),
            r.deposit_source_name, coalesce(r.content,'') || ' - ' || v_nickname, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate)
    returning id into new_leader_tx_id;

    new_member_tx_id := null;
    if v_member_uid is not null then
      insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, recurring_id, input_currency, input_amount, fx_rate, exclude_performance)
      values (v_member_uid, null, 'expense', check_date, r.amount, r.category_name, r.category_emoji, r.source_name, r.content, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), r.input_amount, r.fx_rate, coalesce(r.exclude_performance, false))
      returning id into new_member_tx_id;
    end if;

    insert into public.subscription_deposits (
      group_id, member_id, date, amount, periods, category_name, category_emoji, source_name,
      deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
      leader_category_name, leader_category_emoji, recurring_id, input_currency, input_amount, fx_rate, exclude_performance
    ) values (
      r.group_id, r.member_id, check_date, r.amount, 1, r.category_name, r.category_emoji, r.source_name,
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
