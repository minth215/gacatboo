-- =====================================================================
-- 0115: 이체의 입금 쪽 금액(출금·입금 원천 화폐가 다를 때)
--   · transactions.to_amount / to_currency — 입금 원천 화폐로 받은 금액(예: 140,000원 출금 → 100 USD 입금).
--     비어 있으면 예전처럼 출금 금액(원화 amount 등) 기준
--   · 출금 쪽은 기존대로: 원화 원천 = amount, 외화 원천 = input_currency/input_amount
--   · my_source_balances: 이체 입금 쪽은 to_amount(화폐가 같을 때) 우선
-- 0001~0114 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists to_amount numeric;
alter table public.transactions add column if not exists to_currency text;

drop function if exists public.my_source_balances();
create or replace function public.my_source_balances()
returns table (source_id bigint, current_balance numeric)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date as d),
  mine as (
    select s.id, coalesce(s.balance, 0) as base, coalesce(nullif(s.balance_currency, ''), 'KRW') as cur,
           case when s.balance_set_at is null then null else (s.balance_set_at at time zone 'Asia/Seoul')::date end as from_date
    from public.sources s
    where s.user_id = auth.uid()
      and coalesce((select p.group_type from public.sources p where p.id = s.parent_id), s.group_type) not in ('credit', 'check')
  ),
  -- 화폐별 최근 환율(원/1단위): 내 기록 중 그 화폐로 입력한 가장 최근 기록
  rates as (
    select distinct on (t.input_currency) t.input_currency as cur, t.fx_rate as rate
    from public.transactions t
    where t.user_id = auth.uid() and coalesce(t.input_currency, '') <> '' and t.fx_rate is not null and t.fx_rate > 0
    order by t.input_currency, t.date desc, t.id desc
  ),
  eff as (
    select t.source_id as sid, t.date, t.amount, coalesce(t.input_currency, '') as icur, t.input_amount,
           case t.type when 'income' then 1 else -1 end as sign, null::text as tcur, null::numeric as tamt
    from public.transactions t where t.user_id = auth.uid() and t.source_id is not null and t.type in ('income', 'expense', 'transfer')
    union all
    -- 이체 입금 쪽: 입금 원천 화폐로 받은 금액(to_amount)이 있으면 그 값
    select t.to_source_id, t.date, t.amount, coalesce(t.input_currency, ''), t.input_amount, 1,
           coalesce(nullif(t.to_currency, ''), 'KRW'), t.to_amount
    from public.transactions t where t.user_id = auth.uid() and t.to_source_id is not null and t.type = 'transfer'
    union all
    -- 온누리 가맹점 결제: 차감 시점 잔액 기준 차감액(원화)
    select d.source_id, t.date, d.amount, '', null, -1, null, null
    from public.my_onnuri_deductions() d join public.transactions t on t.id = d.tx_id
  )
  select m.id, round(m.base + coalesce(sum(
           e.sign * case
             when e.tamt is not null and e.tcur = m.cur then e.tamt
             when m.cur = 'KRW' then e.amount
             when e.icur = m.cur and e.input_amount is not null then e.input_amount
             else e.amount / nullif((select r.rate from rates r where r.cur = m.cur), 0)
           end
         ) filter (where e.date <= (select d from today) and (m.from_date is null or e.date >= m.from_date)), 0), 2)
  from mine m left join eff e on e.sid = m.id
  group by m.id, m.base, m.cur;
$$;
grant execute on function public.my_source_balances() to authenticated;
