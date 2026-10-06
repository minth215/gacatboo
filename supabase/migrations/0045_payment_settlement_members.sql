-- =====================================================================
-- 0045: 정산 그룹 결제 내역에 "참여 멤버 + 멤버별 금액" 저장
--   · transaction_settlement_members — 정산(N빵) 카테고리 그룹의 결제 건(transactions
--     행, type='expense')마다, 그 결제에 실제로 참여(분담)하는 멤버와 각자의 분담액을
--     저장한다. 행이 없는 멤버 = 그 결제에서 제외된 멤버.
--   · 이 테이블에 저장된 값이 있는 결제는 정산 탭 집계에서 그 값을 그대로 쓰고,
--     없는(이 기능 전에 등록된) 결제는 기존처럼 전체 멤버 균등분배로 집계한다
--     (SettlementTab.jsx 쪽 처리, 이 마이그레이션은 저장소만 추가).
-- 0001~0044 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.transaction_settlement_members (
  id             bigint generated always as identity primary key,
  transaction_id bigint not null references public.transactions(id) on delete cascade,
  member_id      bigint not null references public.group_members(id) on delete cascade,
  amount         bigint not null check (amount >= 0),
  created_at     timestamptz not null default now(),
  unique (transaction_id, member_id)
);
create index if not exists idx_tsm_tx on public.transaction_settlement_members(transaction_id);

alter table public.transaction_settlement_members enable row level security;

-- 그 결제가 속한 그룹의 멤버라면(0041에서 거래 공유 수정/삭제를 멤버 전원에게 허용한 것과
-- 동일한 기준) 조회·추가·수정·삭제 모두 가능.
drop policy if exists tsm_all on public.transaction_settlement_members;
create policy tsm_all on public.transaction_settlement_members
  for all to authenticated
  using (exists (
    select 1 from public.transactions t
    where t.id = transaction_settlement_members.transaction_id
      and public.is_group_member(t.group_id, auth.uid())
  ))
  with check (exists (
    select 1 from public.transactions t
    where t.id = transaction_settlement_members.transaction_id
      and public.is_group_member(t.group_id, auth.uid())
  ));
