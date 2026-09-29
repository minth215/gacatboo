-- =====================================================================
-- 0020: 친구 관리
--   · friend_groups — 사용자가 직접 만드는 친구 분류(친구/직장/가족 등). categories/sources 와 동일한
--     "사용자 소유 목록 + sort_order" 패턴.
--   · friends — 등록한 친구 한 명. friend_user_id 가 있으면 가캣부 회원(프로필 연결),
--     없으면 비회원(이름만 등록). group_members 의 "계정 멤버 vs 외부 멤버"(user_id nullable)와
--     동일한 설계.
-- 0001~0019 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.friend_groups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_friend_groups_user on public.friend_groups(user_id);

alter table public.friend_groups enable row level security;
drop policy if exists friend_groups_all on public.friend_groups;
create policy friend_groups_all on public.friend_groups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.friends (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  friend_user_id uuid references public.profiles(id) on delete set null,
  nickname       text not null,
  group_id       bigint references public.friend_groups(id) on delete set null,
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  constraint friends_not_self check (friend_user_id is distinct from user_id)
);
create unique index if not exists uq_friends_user_friend
  on public.friends(user_id, friend_user_id) where friend_user_id is not null;
create index if not exists idx_friends_user on public.friends(user_id);
create index if not exists idx_friends_group on public.friends(group_id);

alter table public.friends enable row level security;
drop policy if exists friends_all on public.friends;
create policy friends_all on public.friends
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
