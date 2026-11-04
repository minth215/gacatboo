-- =====================================================================
-- 0085: 원천 금액 = 기준 금액 + 기록 합계(계산식으로 변경)
--   · 0084 의 트리거 방식 대신, 현재 금액을 그때그때 계산한다.
--       현재 금액 = sources.balance(기준 금액, 없으면 0)
--                 + 기준 시점 이후 날짜 ~ 오늘까지 기록의 합(수입 +, 지출 −, 이체 출금 −/입금 +)
--   · 기준 시점(sources.balance_set_at): 원천 관리에서 금액을 직접 수정한 시각.
--       - 없으면(직접 수정한 적 없음) 모든 날짜의 기록을 반영 → 이전 기록도 한 번에 반영됨
--       - 있으면 그 날짜(한국 시간, 당일 포함) 이후 기록만 반영. 그 전 날짜 기록은 직접 입력한 금액에 이미 들어 있다고 봄
--   · 미래 날짜 기록은 그 날짜가 되면 반영(오늘 날짜까지만 합산).
--   · 신용카드/체크카드 그룹(의 세부 항목)은 금액 없음(null).
-- 0001~0084 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources add column if not exists balance_set_at timestamptz;

-- 0084 를 실행했다면: 트리거가 이미 더한 금액을 되돌리고 트리거 제거
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'balance_applied') then
    perform public.apply_tx_balance(t, -1) from public.transactions t where t.balance_applied;
    update public.transactions set balance_applied = false where balance_applied;
  end if;
end $$;
drop trigger if exists tx_source_balance_ins_upd on public.transactions;
drop trigger if exists tx_source_balance_del on public.transactions;
drop function if exists public.trg_tx_source_balance();
drop function if exists public.apply_tx_balance(public.transactions, int);
drop function if exists public.adjust_source_balance(bigint, bigint);
alter table public.transactions drop column if exists balance_applied;

-- 내 원천의 현재 금액
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
  )
  select m.id, (m.base + coalesce(sum(e.delta) filter (
           where e.date <= (select d from today) and (m.from_date is null or e.date >= m.from_date)
         ), 0))::bigint
  from mine m left join eff e on e.sid = m.id
  group by m.id, m.base;
$$;
grant execute on function public.my_source_balances() to authenticated;
