-- =====================================================================
-- 0031: 반복 규칙에 종료일 추가
--   · recurring_rules.end_date — 비어 있으면 무기한 반복(기존 동작과 동일).
--     값이 있으면 그 날짜까지만(포함) 반복 생성, 이후 날짜는 더 이상 생성하지 않음.
--   · generate_recurring_occurrence() 에 종료일 체크를 추가(매일 크론,
--     수동 일괄 생성(backfill_recurring_rule) 양쪽 모두 이 함수를 거치므로
--     한 곳만 고치면 됨). generate_due_recurring_transactions() 의 조회
--     범위도 종료된 규칙을 아예 건너뛰도록 함께 좁힘.
-- 0001~0030 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists end_date date;

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
    months_since := (extract(year from check_date)::int - extract(year from r.start_date)::int) * 12
                  + (extract(month from check_date)::int - extract(month from r.start_date)::int);
    target_day := least(
      extract(day from r.start_date)::int,
      extract(day from (date_trunc('month', check_date) + interval '1 month - 1 day'))::int
    );
    due := (months_since >= 0) and (months_since % r.freq_interval = 0) and (extract(day from check_date)::int = target_day);

  elsif r.freq_unit = 'year' then
    years_since := extract(year from check_date)::int - extract(year from r.start_date)::int;
    target_day := least(
      extract(day from r.start_date)::int,
      extract(day from (date_trunc('month', make_date(extract(year from check_date)::int, extract(month from r.start_date)::int, 1)) + interval '1 month - 1 day'))::int
    );
    due := (years_since >= 0) and (years_since % r.freq_interval = 0)
           and (extract(month from check_date)::int = extract(month from r.start_date)::int)
           and (extract(day from check_date)::int = target_day);
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

create or replace function public.generate_due_recurring_transactions()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  r record;
begin
  for r in select * from public.recurring_rules
    where active and start_date <= today and (end_date is null or end_date >= today)
  loop
    perform public.generate_recurring_occurrence(r, today);
  end loop;
end;
$$;
