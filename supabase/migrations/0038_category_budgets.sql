-- =====================================================================
-- 0038: 분류별 예산 관리
--   category_budgets — 사용자가 수입/지출 분류(categories)별로 연도 단위 예산을
--   설정한다. month=0 행은 그 해의 "기본 예산"(모든 달의 기본값), month=1~12
--   행은 특정 달만 따로 정한 금액(재정의)이다. 조회 시 "해당 달 재정의가
--   있으면 그 값, 없으면 그 해 기본 예산, 둘 다 없으면 미설정"으로 계산한다
--   (서버에는 매달 12개를 복제해 저장하지 않고, 클라이언트에서 이 규칙으로
--   계산해 보여준다 — 기본 예산을 바꾸면 재정의 없는 달에 즉시 반영됨).
-- =====================================================================

create table if not exists public.category_budgets (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete cascade,
  year        int not null,
  month       int not null check (month between 0 and 12), -- 0 = 기본 예산, 1~12 = 월별 재정의
  amount      numeric not null default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, category_id, year, month)
);
create index if not exists idx_category_budgets_user_year on public.category_budgets(user_id, year);

alter table public.category_budgets enable row level security;
drop policy if exists category_budgets_all on public.category_budgets;
create policy category_budgets_all on public.category_budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
