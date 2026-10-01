-- =====================================================================
-- 0027: 구독/정산 그룹의 반복 결제·입금이 "다음 결제일/입금일"을 존중하도록 수정
--   · 구독 그룹은 이미 각 멤버(와 총대)의 마지막 결제일/입금일 + 그 때 커버한 회차(periods)로
--     "다음 결제일"을 계산해 보여주고 있음(SubscriptionGroup.jsx 의 billingAlignedDate+addInterval,
--     또는 총무가 직접 지정한 group_members.next_due_override 가 있으면 그 값 우선).
--   · 반복을 "매월"로 걸어놓아도, 누군가 미리 여러 회차를 선결제해 다음 결제일이 미뤄진 상태라면
--     그 날짜가 되기 전까지는 자동 생성을 건너뛰어야 한다. generate_due_recurring_transactions() 에
--     이 "다음 결제일 이전이면 건너뛰기" 체크를 추가(결제/입금 반복에만 적용, 일반 거래 반복은 영향 없음).
-- 0001~0026 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.generate_due_recurring_transactions()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  r record;
  due boolean;
  months_since int;
  years_since int;
  week_start_rule date;
  week_start_today date;
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
  for r in select * from public.recurring_rules where active and start_date <= today loop
    due := false;

    if r.freq_unit = 'day' then
      due := ((today - r.start_date) % r.freq_interval) = 0;

    elsif r.freq_unit = 'week' then
      week_start_rule := r.start_date - extract(dow from r.start_date)::int;
      week_start_today := today - extract(dow from today)::int;
      weeks_since := (week_start_today - week_start_rule) / 7;
      due := (weeks_since % r.freq_interval = 0) and (extract(dow from today)::int = any(r.weekdays));

    elsif r.freq_unit = 'month' then
      months_since := (extract(year from today)::int - extract(year from r.start_date)::int) * 12
                    + (extract(month from today)::int - extract(month from r.start_date)::int);
      target_day := least(
        extract(day from r.start_date)::int,
        extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int
      );
      due := (months_since >= 0) and (months_since % r.freq_interval = 0) and (extract(day from today)::int = target_day);

    elsif r.freq_unit = 'year' then
      years_since := extract(year from today)::int - extract(year from r.start_date)::int;
      target_day := least(
        extract(day from r.start_date)::int,
        extract(day from (date_trunc('month', make_date(extract(year from today)::int, extract(month from r.start_date)::int, 1)) + interval '1 month - 1 day'))::int
      );
      due := (years_since >= 0) and (years_since % r.freq_interval = 0)
             and (extract(month from today)::int = extract(month from r.start_date)::int)
             and (extract(day from today)::int = target_day);
    end if;

    -- 구독/정산 그룹의 결제·입금 반복은 "다음 결제일/입금일"이 아직 안 됐으면 건너뛴다(선결제 반영).
    -- 총무가 직접 지정한 next_due_override 가 있으면 그 값을 최우선으로 쓰고, 없으면 마지막 결제/입금일을
    -- 그 달의 정기결제일(billing_day)로 맞춘 뒤 period_unit/period_count × periods(회차)만큼 더해 계산한다
    -- (SubscriptionGroup.jsx 의 "다음 결제일" 표시 로직과 동일).
    if due and r.target in ('subscription_payment', 'subscription_deposit') then
      select billing_day, period_unit, period_count into v_billing_day, v_period_unit, v_period_count
        from public.subscriptions where group_id = r.group_id;

      if r.target = 'subscription_payment' then
        select next_due_override into v_override from public.group_members where group_id = r.group_id and role = 'owner';
        select date, periods into v_last_date, v_last_periods
          from public.subscription_payments where group_id = r.group_id order by date desc, id desc limit 1;
      else
        select next_due_override into v_override from public.group_members where id = r.member_id;
        select date, periods into v_last_date, v_last_periods
          from public.subscription_deposits where group_id = r.group_id and member_id = r.member_id order by date desc, id desc limit 1;
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

      if v_next_due is not null and today < v_next_due then
        due := false;
      end if;
    end if;

    if due and not exists (select 1 from public.transactions t where t.recurring_id = r.id and t.date = today) then

      if r.target = 'subscription_payment' then
        -- 수동 "결제 추가"(db.createPayment)와 동일한 3단계 미러링
        insert into public.transactions (
          user_id, group_id, type, date, amount, category_name, category_emoji,
          source_id, source_name, content, memo, created_by, recurring_id
        ) values (
          r.user_id, null, r.type, today, r.amount, r.category_name, r.category_emoji,
          r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id
        ) returning id into new_tx_id;

        insert into public.subscription_payments (
          group_id, date, amount, category_name, category_emoji, source_id, source_name,
          content, memo, tx_id, created_by, periods, recurring_id
        ) values (
          r.group_id, today, r.amount, r.category_name, r.category_emoji, r.source_id, r.source_name,
          r.content, r.memo, new_tx_id, r.user_id, 1, r.id
        ) returning id into new_pay_id;

        update public.transactions set origin_type = 'payment', origin_id = new_pay_id, origin_group_id = r.group_id
          where id = new_tx_id;

      elsif r.target = 'subscription_deposit' then
        -- create_subscription_deposit RPC와 동일한 로직(크론은 auth.uid() 세션이 없어 RPC를 직접
        -- 호출할 수 없으므로 그 본문을 그대로 재구현)
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
        values (v_owner_id, null, 'income', today, r.amount, coalesce(v_lcat,''), coalesce(v_lemoji,''),
                r.deposit_source_name, coalesce(r.content,'') || ' - ' || v_nickname, r.memo, r.user_id, r.id)
        returning id into new_leader_tx_id;

        new_member_tx_id := null;
        if v_member_uid is not null then
          insert into public.transactions (user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, recurring_id)
          values (v_member_uid, null, 'expense', today, r.amount, r.category_name, r.category_emoji, r.source_name, r.content, r.memo, r.user_id, r.id)
          returning id into new_member_tx_id;
        end if;

        insert into public.subscription_deposits (
          group_id, member_id, date, amount, periods, category_name, category_emoji, source_name,
          deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
          leader_category_name, leader_category_emoji, recurring_id
        ) values (
          r.group_id, r.member_id, today, r.amount, 1, r.category_name, r.category_emoji, r.source_name,
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
          r.user_id, r.group_id, r.type, today, r.amount, r.category_id, r.category_name, r.category_emoji, r.category_color,
          r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id
        );
      end if;

    end if;
  end loop;
end;
$$;
