-- =====================================================================
-- 0106: 보조 화폐 반복(구독 그룹 입금)의 선입금 차감
--   · 반복 금액이 보조 화폐(예: 200달러)이고 직전 입금도 같은 화폐면 화폐 금액 기준으로
--     "입금액 − 회차 × 1회분"을 다음 자동 입금에서 차감(300달러 입금 → 다음 회차 100달러)
--   · group_recurring_schedule 에 input_currency/input_amount 추가(회차 자동 계산용)
-- 0001~0105 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

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
  v_last_amount bigint;
  v_amt bigint := r.amount;
  v_carry bigint;
  v_in_amt numeric := r.input_amount;
  v_last_cur text;
  v_last_in numeric;
  v_fcarry numeric;
  v_msrc_name text;
  v_mcat_emoji text;
begin
  -- 반복일 판정(영업일 보정 포함, 시작일·종료일 처리) — recurring_due_nominal 과 동일
  due := public.recurring_due_nominal(r, check_date) is not null;

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
      select date, periods, amount, coalesce(input_currency, ''), input_amount into v_last_date, v_last_periods, v_last_amount, v_last_cur, v_last_in
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

    -- 직전 입금이 회차 금액(규칙 금액 × 회차)보다 많았으면 남은 금액을 미리 낸 것으로 보고 이번 회차에서 차감
    -- (예: 1회분 6000원, 20000원 입금 = 3회분 + 2000원 → 다음 회차 4000원)
    if r.target = 'subscription_deposit' and v_last_date is not null then
      if coalesce(r.input_currency, '') = '' then
        if r.amount > 0 then
          v_carry := coalesce(v_last_amount, 0) - greatest(coalesce(v_last_periods, 1), 1) * r.amount;
          if v_carry > 0 and v_carry < r.amount then v_amt := r.amount - v_carry; end if;
        end if;
      -- 보조 화폐 반복(예: 200달러): 직전 입금도 같은 화폐면 화폐 금액 기준으로 차감(300달러 → 다음 100달러).
      -- 원화 금액은 규칙 환율로 넣어 두고, 자동 등록 후 그날 환율로 다시 계산된다(recurring-fx)
      elsif coalesce(r.input_amount, 0) > 0 and v_last_cur = r.input_currency and v_last_in is not null then
        v_fcarry := v_last_in - greatest(coalesce(v_last_periods, 1), 1) * r.input_amount;
        if v_fcarry > 0 and v_fcarry < r.input_amount then
          v_in_amt := r.input_amount - v_fcarry;
          v_amt := round(v_in_amt * coalesce(r.fx_rate, r.amount::numeric / r.input_amount));
        end if;
      end if;
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
    values (v_owner_id, null, 'income', check_date, v_amt, coalesce(v_lcat,''), coalesce(v_lemoji,''),
            r.deposit_source_name, coalesce(r.content,'') || ' - ' || v_nickname, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), v_in_amt, r.fx_rate)
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
      values (v_member_uid, null, 'expense', check_date, v_amt, r.category_name, v_mcat_emoji, v_msrc_id, v_msrc_name, r.content, r.memo, r.user_id, r.id, coalesce(r.input_currency, ''), v_in_amt, r.fx_rate, coalesce(r.exclude_performance, false))
      returning id into new_member_tx_id;
    end if;

    insert into public.subscription_deposits (
      group_id, member_id, date, amount, periods, category_name, category_emoji, source_name,
      deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
      leader_category_name, leader_category_emoji, recurring_id, input_currency, input_amount, fx_rate, exclude_performance
    ) values (
      r.group_id, r.member_id, check_date, v_amt, 1, r.category_name, v_mcat_emoji, v_msrc_name,
      r.deposit_source_name, r.content, r.memo, new_leader_tx_id, new_member_tx_id, r.user_id,
      coalesce(v_lcat,''), coalesce(v_lemoji,''), r.id, coalesce(r.input_currency, ''), v_in_amt, r.fx_rate, coalesce(r.exclude_performance, false)
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

drop function if exists public.group_recurring_schedule(bigint);
create or replace function public.group_recurring_schedule(p_group_id bigint)
returns table (id bigint, target text, member_id bigint, start_date date, end_date date,
               freq_unit text, freq_interval int, weekdays int[], active boolean, next_date date, amount bigint, input_currency text, input_amount numeric)
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
    freq_unit := r.freq_unit; freq_interval := r.freq_interval; weekdays := r.weekdays; active := r.active; amount := r.amount;
    input_currency := coalesce(r.input_currency, ''); input_amount := r.input_amount;
    next_date := public.recurring_next_date(r, v_from);
    return next;
  end loop;
end;
$$;
grant execute on function public.group_recurring_schedule(bigint) to authenticated;
