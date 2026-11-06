-- =====================================================================
-- 0103: 그룹 부가 정보 정리 + 멤버별 정기 입금 설정
--   · 정산 그룹 총무 입금 정보(입금 계좌·카카오페이 송금 링크) 폐기 → groups 컬럼 삭제
--   · 구독 그룹 구독 설정(입금 방식·정기결제일/금액·정기입금액·주기·입금 분류·내용 기본값) 폐기
--     → subscriptions 컬럼 삭제(입금 원천 deposit_source_* 만 남김).
--     총대 입금 분류는 항상 '정산'(이모지는 총대의 수입 분류 '정산'), 내용 기본값은 그룹명(앱에서 처리).
--   · 정기 결제/입금 일자·금액·주기는 반복 규칙으로 관리:
--       recurring_rules.generate_on_start — 기록 없이 규칙만 만든 경우(정기 입금 설정) 시작일 회차도 생성
--       generate_recurring_occurrence — 구독 설정 대신 규칙 주기로 선입금(여러 회차) 건너뛰기 판단
--       group_recurring_schedule(그룹) — 그룹 멤버 누구나 다음 결제일/입금일 계산용 일정 조회
--       run_recurring_rule_today(규칙) — 시작일이 오늘인 새 규칙의 오늘 회차를 바로 생성
-- 0001~0102 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists generate_on_start boolean not null default false;

-- 그룹 총무/총대의 수입 분류 '정산' 이모지
create or replace function public.group_owner_settle_emoji(p_group_id bigint)
returns text language sql security definer stable set search_path = public as $$
  select coalesce((
    select c.emoji from public.categories c join public.groups g on g.owner_id = c.user_id
    where g.id = p_group_id and c.type = 'income' and c.name = '정산' order by c.id limit 1
  ), '');
$$;

create or replace function public.create_subscription_deposit(
  p_group_id bigint, p_member_id bigint, p_date date, p_amount bigint, p_periods int,
  p_category_name text, p_category_emoji text, p_source_id bigint, p_source_name text,
  p_deposit_source_name text, p_content text, p_memo text,
  p_leader_category_name text, p_leader_category_emoji text, p_leader_settlement_target_id bigint,
  p_items jsonb default null
) returns bigint
language plpgsql security definer set search_path = public as $create_dep$
declare
  v_uid uuid := auth.uid();
  v_owner uuid; v_member_uid uuid; v_nickname text;
  v_lcat text; v_lemoji text;
  v_leader_tx bigint; v_member_tx bigint; v_dep_id bigint;
begin
  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner is null then raise exception '그룹을 찾을 수 없습니다.'; end if;

  select user_id, coalesce(nullif(nickname,''), '멤버') into v_member_uid, v_nickname
    from public.group_members where id = p_member_id and group_id = p_group_id;
  if not found then raise exception '멤버를 찾을 수 없습니다.'; end if;

  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '입금을 입력할 권한이 없습니다.';
  end if;

  -- 총대 분류: 미지정 시 '정산'
  if coalesce(p_leader_category_name,'') = '' then
    v_lcat := '정산'; v_lemoji := public.group_owner_settle_emoji(p_group_id);
  else
    v_lcat := p_leader_category_name; v_lemoji := coalesce(p_leader_category_emoji,'');
  end if;

  -- 총대 수입 tx
  insert into public.transactions(user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, settlement_target_id, items)
  values (v_owner, null, 'income', p_date, p_amount, coalesce(v_lcat,''), coalesce(v_lemoji,''),
          coalesce(p_deposit_source_name,''), coalesce(p_content,'') || ' - ' || v_nickname, coalesce(p_memo,''), v_uid, p_leader_settlement_target_id, p_items)
  returning id into v_leader_tx;

  -- 멤버 지출 tx (계정 멤버만)
  if v_member_uid is not null then
    insert into public.transactions(user_id, group_id, type, date, amount, category_id, category_name, category_emoji, source_id, source_name, content, memo, created_by, items)
    values (v_member_uid, null, 'expense', p_date, p_amount, null, coalesce(p_category_name,''), coalesce(p_category_emoji,''),
            null, coalesce(p_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_uid, p_items)
    returning id into v_member_tx;
  end if;

  insert into public.subscription_deposits(
    group_id, member_id, date, amount, periods, category_name, category_emoji, source_id, source_name,
    deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
    leader_category_name, leader_category_emoji, leader_settlement_target_id, items)
  values (p_group_id, p_member_id, p_date, p_amount, greatest(coalesce(p_periods,1),1),
    coalesce(p_category_name,''), coalesce(p_category_emoji,''), null, coalesce(p_source_name,''),
    coalesce(p_deposit_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_leader_tx, v_member_tx, v_uid,
    coalesce(v_lcat,''), coalesce(v_lemoji,''), p_leader_settlement_target_id, p_items)
  returning id into v_dep_id;

  update public.transactions set origin_type='deposit', origin_id=v_dep_id, origin_group_id=p_group_id
    where id = v_leader_tx or id = v_member_tx;
  return v_dep_id;
end;
$create_dep$;

grant execute on function public.create_subscription_deposit(bigint,bigint,date,bigint,int,text,text,bigint,text,text,text,text,text,text,bigint,jsonb) to authenticated;

create or replace function public.sync_deposit_txs()
returns trigger language plpgsql security definer set search_path = public as $sync_dep$
declare v_nick text; v_lcat text; v_lemoji text;
begin
  select coalesce(nullif(nickname,''), '멤버') into v_nick from public.group_members where id = NEW.member_id;
  if coalesce(NEW.leader_category_name,'') = '' then
    v_lcat := '정산'; v_lemoji := public.group_owner_settle_emoji(NEW.group_id);
  else
    v_lcat := NEW.leader_category_name; v_lemoji := coalesce(NEW.leader_category_emoji,'');
  end if;

  if NEW.leader_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = coalesce(v_lcat,''), category_emoji = coalesce(v_lemoji,''),
      source_name = NEW.deposit_source_name,
      content = coalesce(NEW.content,'') || ' - ' || v_nick, memo = NEW.memo,
      settlement_target_id = NEW.leader_settlement_target_id,
      items = NEW.items,
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate
    where id = NEW.leader_tx_id;
  end if;

  if NEW.member_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = NEW.category_name, category_emoji = NEW.category_emoji, source_name = NEW.source_name,
      content = NEW.content, memo = NEW.memo,
      items = NEW.items,
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate,
      exclude_performance = coalesce(NEW.exclude_performance, false)
    where id = NEW.member_tx_id;
  end if;
  return NEW;
end;
$sync_dep$;

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


-- 다음 결제일/입금일 계산용: 그룹의 결제·입금 반복 일정(내용·금액 등은 제외)
create or replace function public.group_recurring_schedule(p_group_id bigint)
returns table (id bigint, target text, member_id bigint, start_date date, end_date date,
               freq_unit text, freq_interval int, weekdays int[], active boolean)
language sql security definer stable set search_path = public as $$
  select r.id, r.target, r.member_id, r.start_date, r.end_date, r.freq_unit, r.freq_interval, r.weekdays, r.active
  from public.recurring_rules r
  where r.group_id = p_group_id and r.active
    and r.target in ('subscription_payment', 'subscription_deposit')
    and (public.is_group_member(p_group_id, auth.uid()) or public.is_group_owner(p_group_id, auth.uid()));
$$;
grant execute on function public.group_recurring_schedule(bigint) to authenticated;

-- 새로 만든 규칙의 시작일이 오늘이면 오늘 회차를 바로 생성(같은 날 중복 생성은 generate 쪽에서 막음)
create or replace function public.run_recurring_rule_today(p_rule_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_rules;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if not found then return false; end if;
  if r.user_id <> auth.uid() and not public.is_deposit_rule_counterpart(r.id, auth.uid()) then
    raise exception '권한이 없습니다.';
  end if;
  if not r.active or r.start_date <> today then return false; end if;
  return public.generate_recurring_occurrence(r, today);
end;
$$;
grant execute on function public.run_recurring_rule_today(bigint) to authenticated;

-- ---------- 폐기한 컬럼 삭제 ----------
alter table public.groups drop column if exists owner_account;
alter table public.groups drop column if exists owner_kakaopay_link;

alter table public.subscriptions drop column if exists mode;
alter table public.subscriptions drop column if exists billing_day;
alter table public.subscriptions drop column if exists billing_amount;
alter table public.subscriptions drop column if exists deposit_amount;
alter table public.subscriptions drop column if exists period_unit;
alter table public.subscriptions drop column if exists period_count;
alter table public.subscriptions drop column if exists deposit_category;
alter table public.subscriptions drop column if exists deposit_category_emoji;
alter table public.subscriptions drop column if exists deposit_content_template;
alter table public.subscriptions drop column if exists payment_content_template;
