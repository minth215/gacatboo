-- =====================================================================
-- 0086: 온누리 가맹점 결제
--   · 디지털 온누리 연결(onnuri_linked) 카드로 "온누리 가맹점" 지출을 기록하면, 저장 시점의 디지털 온누리
--     원천 금액에서 먼저 차감하고(onnuri_amount, 최대 지출 금액) 나머지는 카드 결제로 본다.
--       transactions.onnuri            — 온누리 가맹점 여부(기본 OFF)
--       transactions.onnuri_source_id  — 차감한 디지털 온누리 원천(세부 항목)
--       transactions.onnuri_amount     — 디지털 온누리에서 차감한 금액
--   · 카드 실적은 그대로 지출 금액 전체(amount) 기준.
--   · my_source_balances: 디지털 온누리 원천에서 onnuri_amount 만큼 차감(날짜 기준은 다른 기록과 동일).
-- 0001~0085 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists onnuri boolean not null default false;
alter table public.transactions add column if not exists onnuri_source_id bigint references public.sources(id) on delete set null;
alter table public.transactions add column if not exists onnuri_amount bigint;

create or replace function public.my_source_balances()
returns table (source_id bigint, current_balance bigint)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date as d),
  mine as (
    select s.id, coalesce(s.balance, 0) as base,
           case when s.balance_set_at is null then null else (s.balance_set_at at time zone 'Asia/Seoul')::date end as from_date
    from public.sources s
    where s.user_id = auth.uid()
      and coalesce((select p.group_type from public.sources p where p.id = s.parent_id), s.group_type) not in ('credit', 'check')
  ),
  eff as (
    select t.source_id as sid, t.date,
           case t.type when 'income' then t.amount else -t.amount end as delta
    from public.transactions t where t.user_id = auth.uid() and t.source_id is not null and t.type in ('income', 'expense', 'transfer')
    union all
    select t.to_source_id, t.date, t.amount
    from public.transactions t where t.user_id = auth.uid() and t.to_source_id is not null and t.type = 'transfer'
    union all
    -- 온누리 가맹점 결제: 디지털 온누리 원천에서 차감
    select t.onnuri_source_id, t.date, -coalesce(t.onnuri_amount, 0)
    from public.transactions t where t.user_id = auth.uid() and t.onnuri and t.onnuri_source_id is not null and t.type = 'expense'
  )
  select m.id, (m.base + coalesce(sum(e.delta) filter (
           where e.date <= (select d from today) and (m.from_date is null or e.date >= m.from_date)
         ), 0))::bigint
  from mine m left join eff e on e.sid = m.id
  group by m.id, m.base;
$$;
grant execute on function public.my_source_balances() to authenticated;
