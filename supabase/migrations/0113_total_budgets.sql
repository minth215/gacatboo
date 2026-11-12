-- =====================================================================
-- 0113: 수입/지출 전체 예산
--   total_budgets — 분류별 예산(category_budgets)과 같은 규칙: month=0 이 그 해의 기본 전체 예산,
--   month=1~12 는 그 달만 따로 정한 값. 적용 값 = 그 달 재정의 ?? 기본 ?? 미설정(클라이언트 계산).
--   전체 예산은 그 달 분류별 예산 합보다 커야 함(앱에서 검사).
-- 0001~0112 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.total_budgets (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type       text not null check (type in ('income', 'expense')),
  year       int not null,
  month      int not null check (month between 0 and 12),
  amount     numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, type, year, month)
);
create index if not exists idx_total_budgets_user_year on public.total_budgets(user_id, year);

alter table public.total_budgets enable row level security;
drop policy if exists total_budgets_all on public.total_budgets;
create policy total_budgets_all on public.total_budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
