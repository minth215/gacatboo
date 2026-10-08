-- =====================================================================
-- 0051: 공금 그룹의 "사용 내역"/"이체 내역" 저장소
--   · pooled_fund_expenses      — 공금 사용 내역(그룹 전체 기준 1건). 항목별 내용/금액은
--     items(jsonb)에 스냅샷으로 저장(수정 화면 복원용, transactions.items 와 동일 패턴).
--   · pooled_fund_expense_members — 그 사용 건에 실제로 참여(분담)하는 멤버와 각자의 몫.
--     계정이 있는 멤버는 transaction_id 로 그 멤버 개인 가계부에 미러링된 지출 거래를 연결.
--   · pooled_fund_transfers     — 멤버 개인 통장에서 공금 통장으로의 이체 내역(멤버당 1건).
--     계정이 있는 멤버는 member_tx_id 로 그 멤버 개인 가계부에 미러링된 이체 거래를 연결.
-- 0001~0050 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.pooled_fund_expenses (
  id         bigint generated always as identity primary key,
  group_id   bigint not null references public.groups(id) on delete cascade,
  date       date not null,
  amount     bigint not null check (amount >= 0),
  content    text not null default '',
  memo       text not null default '',
  items      jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_pfe_group on public.pooled_fund_expenses(group_id, date);

create table if not exists public.pooled_fund_expense_members (
  id             bigint generated always as identity primary key,
  expense_id     bigint not null references public.pooled_fund_expenses(id) on delete cascade,
  member_id      bigint not null references public.group_members(id) on delete cascade,
  amount         bigint not null check (amount >= 0),
  transaction_id bigint references public.transactions(id) on delete set null,
  unique (expense_id, member_id)
);
create index if not exists idx_pfem_expense on public.pooled_fund_expense_members(expense_id);

create table if not exists public.pooled_fund_transfers (
  id             bigint generated always as identity primary key,
  group_id       bigint not null references public.groups(id) on delete cascade,
  member_id      bigint not null references public.group_members(id) on delete cascade,
  date           date not null,
  amount         bigint not null check (amount >= 0),
  from_source_name text not null default '',
  content        text not null default '',
  memo           text not null default '',
  member_tx_id   bigint references public.transactions(id) on delete set null,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists idx_pft_group on public.pooled_fund_transfers(group_id, date);

alter table public.pooled_fund_expenses enable row level security;
alter table public.pooled_fund_expense_members enable row level security;
alter table public.pooled_fund_transfers enable row level security;

drop policy if exists pfe_all on public.pooled_fund_expenses;
create policy pfe_all on public.pooled_fund_expenses
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists pfem_all on public.pooled_fund_expense_members;
create policy pfem_all on public.pooled_fund_expense_members
  for all to authenticated
  using (exists (
    select 1 from public.pooled_fund_expenses e
    where e.id = pooled_fund_expense_members.expense_id and public.is_group_member(e.group_id, auth.uid())
  ))
  with check (exists (
    select 1 from public.pooled_fund_expenses e
    where e.id = pooled_fund_expense_members.expense_id and public.is_group_member(e.group_id, auth.uid())
  ));

drop policy if exists pft_all on public.pooled_fund_transfers;
create policy pft_all on public.pooled_fund_transfers
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));
