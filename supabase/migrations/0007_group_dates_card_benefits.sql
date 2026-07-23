-- =====================================================================
-- 0007: 그룹 시작/종료일 + 카드 실적(혜택 구간) 관리
-- 0001~0006 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 1) 그룹 시작/종료일
alter table public.groups add column if not exists start_date date;
alter table public.groups add column if not exists end_date   date;
-- 기존 그룹은 생성일을 시작일로 백필
update public.groups set start_date = created_at::date where start_date is null;

-- 2) 카드 실적 구간 (원천 중 '카드' 항목별 혜택)
create table if not exists public.card_benefit_tiers (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  source_id  bigint not null references public.sources(id) on delete cascade,
  threshold  bigint not null default 0,   -- 이 실적(사용액) 이상이면 혜택 적용
  benefit    text   not null default '',  -- 혜택 설명
  sort_order int    not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_card_tiers_user   on public.card_benefit_tiers(user_id);
create index if not exists idx_card_tiers_source on public.card_benefit_tiers(source_id);

alter table public.card_benefit_tiers enable row level security;
drop policy if exists card_tiers_all on public.card_benefit_tiers;
create policy card_tiers_all on public.card_benefit_tiers
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
