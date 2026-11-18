-- =====================================================================
-- 0114: 원천 금액의 화폐 단위
--   · sources.balance_currency — 원천 금액(잔액)의 화폐(비어 있으면 원화 KRW: 기존 원천 그대로)
--   · sources.balance 를 소수 금액도 담을 수 있게 numeric 으로(외화 통장 1,234.56 USD 등)
--   · my_source_balances: 원천 화폐 기준으로 계산
--       원화 원천 — 기록의 원화 금액(기존과 동일)
--       외화 원천 — 같은 화폐로 입력한 기록은 입력 금액(input_amount) 그대로,
--                   다른 화폐로 입력한 기록은 원화 금액을 그 화폐의 가장 최근 환율(내 기록 기준)로 나눠 환산
-- 0001~0113 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources add column if not exists balance_currency text;
alter table public.sources alter column balance type numeric using balance::numeric;

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
           case t.type when 'income' then 1 else -1 end as sign
    from public.transactions t where t.user_id = auth.uid() and t.source_id is not null and t.type in ('income', 'expense', 'transfer')
    union all
    select t.to_source_id, t.date, t.amount, coalesce(t.input_currency, ''), t.input_amount, 1
    from public.transactions t where t.user_id = auth.uid() and t.to_source_id is not null and t.type = 'transfer'
    union all
    -- 온누리 가맹점 결제: 차감 시점 잔액 기준 차감액(원화)
    select d.source_id, t.date, d.amount, '', null, -1
    from public.my_onnuri_deductions() d join public.transactions t on t.id = d.tx_id
  )
  select m.id, round(m.base + coalesce(sum(
           e.sign * case
             when m.cur = 'KRW' then e.amount
             when e.icur = m.cur and e.input_amount is not null then e.input_amount
             else e.amount / nullif((select r.rate from rates r where r.cur = m.cur), 0)
           end
         ) filter (where e.date <= (select d from today) and (m.from_date is null or e.date >= m.from_date)), 0), 2)
  from mine m left join eff e on e.sid = m.id
  group by m.id, m.base, m.cur;
$$;
grant execute on function public.my_source_balances() to authenticated;
