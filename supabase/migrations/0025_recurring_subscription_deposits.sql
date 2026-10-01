-- =====================================================================
-- 0025: 구독/정산 그룹 "입금"도 반복 설정으로 자동 생성되도록 확장
--   · recurring_rules.target 에 'subscription_deposit' 추가.
--   · recurring_rules.member_id — 입금 반복의 대상 멤버(group_members.id). 입금이 아니면 null.
--   · recurring_rules.leader_category_name/leader_category_emoji/deposit_source_name —
--     입금은 "총대 수입" + "멤버 지출"이 동시에 생기므로, 기존 category_name/category_emoji/
--     source_name(멤버 쪽)과 별도로 총대 쪽 필드를 추가로 둔다.
--   · subscription_deposits.recurring_id — 이 입금이 어느 반복 규칙에서 왔는지(아이콘 on/off 판단용).
--   · generate_due_recurring_transactions() 를 다시 정의해 target='subscription_deposit' 인
--     규칙은 create_subscription_deposit RPC와 동일한 3단계(총대 수입 tx, 멤버 지출 tx(계정 멤버만),
--     subscription_deposits 행)를 직접 수행(크론은 auth.uid() 세션이 없어 RPC를 그대로 호출할 수
--     없어 로직을 인라인으로 재구현).
--   · 반복 설정의 "정산 대상"(leader_settlement_target_id)은 매번 같은 과거 지출을 다시 정산하는
--     꼴이 되어 의미가 없으므로 반복 생성분에는 설정하지 않음(수동 입금에서는 기존대로 동작).
-- 0001~0024 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists member_id bigint references public.group_members(id) on delete cascade;
alter table public.recurring_rules add column if not exists leader_category_name text not null default '';
alter table public.recurring_rules add column if not exists leader_category_emoji text not null default '';
alter table public.recurring_rules add column if not exists deposit_source_name text not null default '';

alter table public.recurring_rules drop constraint if exists recurring_rules_target_check;
alter table public.recurring_rules add constraint recurring_rules_target_check
  check (target in ('transaction','subscription_payment','subscription_deposit'));

alter table public.subscription_deposits add column if not exists recurring_id bigint references public.recurring_rules(id) on delete set null;
create index if not exists idx_sub_deposits_recurring on public.subscription_deposits(recurring_id);

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
