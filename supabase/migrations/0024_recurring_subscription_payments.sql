-- =====================================================================
-- 0024: 구독 그룹 "결제"도 반복 설정으로 자동 생성 가능하도록 확장
--   · recurring_rules.target — 'transaction'(기본, 개인/일반·정산 그룹 거래) |
--     'subscription_payment'(구독 그룹 결제 — 수동 "결제 추가"와 완전히 동일한 방식으로
--     subscription_payments 에 기록되고 transactions 에 미러링됨(origin_type='payment' 등),
--     기존 결제 내역/정산/통계/"N회분" 로직을 그대로 재사용).
--   · subscription_payments.recurring_id — 이 결제가 어느 반복 규칙에서 왔는지(아이콘 on/off 판단용).
--   · generate_due_recurring_transactions() 를 다시 정의해 target='subscription_payment' 인
--     규칙은 subscription_payments + 미러 transactions 를 함께 생성하도록 분기.
-- 0001~0023 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists target text not null default 'transaction' check (target in ('transaction','subscription_payment'));
alter table public.subscription_payments add column if not exists recurring_id bigint references public.recurring_rules(id) on delete set null;
create index if not exists idx_sub_payments_recurring on public.subscription_payments(recurring_id);

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
