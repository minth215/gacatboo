-- =====================================================================
-- 가계부 (gacatboo) — Supabase 스키마 · RLS · 트리거
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.
-- =====================================================================

-- ---------- 프로필 (auth.users 확장) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text not null,
  role         text not null default 'user'    check (role in ('admin','user')),
  status       text not null default 'pending'  check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);

-- ---------- 분류 (categories) ----------
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('income','expense')),
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_user on public.categories(user_id, type);

-- ---------- 원천 (sources) — 2단계 트리 ----------
create table if not exists public.sources (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  parent_id  bigint references public.sources(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_sources_user on public.sources(user_id);

-- ---------- 그룹 (groups) ----------
create table if not exists public.groups (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text not null default '',
  category    text not null default '기타' check (category in ('여행','구독','동거','N빵','기타')),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id bigint not null references public.groups(id) on delete cascade,
  user_id  uuid   not null references public.profiles(id) on delete cascade,
  role     text   not null default 'member' check (role in ('owner','member')),
  primary key (group_id, user_id)
);

-- ---------- 가계부 항목 (transactions) ----------
create table if not exists public.transactions (
  id            bigint generated always as identity primary key,
  user_id       uuid   not null,                                                        -- 귀속 멤버(그룹) / 소유자(개인)
  group_id      bigint references public.groups(id) on delete cascade,                  -- null => 개인
  type          text   not null check (type in ('income','expense')),
  date          date   not null,
  amount        bigint not null check (amount >= 0),
  category_id   bigint references public.categories(id) on delete set null,
  category_name text   not null default '',
  source_id     bigint references public.sources(id) on delete set null,
  source_name   text   not null default '',
  content       text   not null default '',
  memo          text   not null default '',
  created_by    uuid,                                                                   -- 작성자
  created_at    timestamptz not null default now(),
  -- 명명된 FK (PostgREST 임베딩 시 작성자/귀속자 구분에 사용)
  constraint transactions_user_fk    foreign key (user_id)    references public.profiles(id) on delete cascade,
  constraint transactions_creator_fk foreign key (created_by) references public.profiles(id) on delete set null
);
create index if not exists idx_tx_user_date  on public.transactions(user_id, date);
create index if not exists idx_tx_group_date on public.transactions(group_id, date);

-- =====================================================================
-- 헬퍼 함수 (SECURITY DEFINER — RLS 재귀 방지)
-- =====================================================================
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

create or replace function public.is_group_member(gid bigint, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid);
$$;

create or replace function public.is_group_owner(gid bigint, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = gid and g.owner_id = uid);
$$;

-- =====================================================================
-- 기본값 시드 & 신규 가입 트리거
-- =====================================================================
create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inc text[] := array['월급','부수입','용돈','금융소득'];
  exp text[] := array['식당','교통','쇼핑','문화생활','통신','보험','병원','교육','구독','기타'];
  src text[] := array['현금','은행','카드','기타'];
  i int;
begin
  for i in 1 .. array_length(inc,1) loop
    insert into public.categories(user_id, type, name, sort_order) values (uid, 'income', inc[i], i-1);
  end loop;
  for i in 1 .. array_length(exp,1) loop
    insert into public.categories(user_id, type, name, sort_order) values (uid, 'expense', exp[i], i-1);
  end loop;
  for i in 1 .. array_length(src,1) loop
    insert into public.sources(user_id, parent_id, name, sort_order) values (uid, null, src[i], i-1);
  end loop;
end;
$$;

-- auth.users 생성 시: 프로필 생성 + 기본값 시드.
-- 최초 사용자는 자동으로 관리자(승인)로 부트스트랩.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  has_admin  boolean;
  uname      text;
  dname      text;
begin
  select exists(select 1 from public.profiles where role = 'admin') into has_admin;
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  dname := coalesce(new.raw_user_meta_data->>'display_name', uname);

  insert into public.profiles(id, username, display_name, role, status)
  values (
    new.id,
    uname,
    dname,
    case when has_admin then 'user' else 'admin' end,
    case when has_admin then 'pending' else 'approved' end
  );
  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RLS 활성화
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.sources       enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.transactions  enable row level security;

-- ---------- profiles ----------
-- 로그인한 사용자는 프로필 조회 가능(그룹 멤버 표시/작성자 이름 등). 민감정보(비밀번호)는 auth.users에만 존재.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- 상태/역할 변경은 관리자만. (신규 프로필은 트리거가 생성)
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin(auth.uid()));

-- ---------- categories (본인 소유) ----------
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- sources (본인 소유) ----------
drop policy if exists sources_all on public.sources;
create policy sources_all on public.sources
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- groups ----------
-- 소유자(총무)는 항상 조회 가능(그룹 생성 직후 멤버십 추가 전 반환행 포함) + 멤버 조회.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated using (
    owner_id = auth.uid() or public.is_group_member(id, auth.uid())
  );

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated using (owner_id = auth.uid());

-- ---------- group_members ----------
drop policy if exists gm_select on public.group_members;
create policy gm_select on public.group_members
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));

-- 총무가 멤버 추가. (그룹 생성 시 owner 자신 추가도 owner이므로 허용)
drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members
  for insert to authenticated with check (public.is_group_owner(group_id, auth.uid()));

drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members
  for delete to authenticated using (public.is_group_owner(group_id, auth.uid()));

-- ---------- transactions ----------
-- 개인 항목: 본인 것. 그룹 항목: 그룹 멤버 전원에게 노출(가계부 반영).
drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions
  for select to authenticated using (
    (group_id is null and user_id = auth.uid())
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
  );

drop policy if exists tx_insert on public.transactions;
create policy tx_insert on public.transactions
  for insert to authenticated with check (
    created_by = auth.uid()
    and (
      (group_id is null and user_id = auth.uid())
      or (group_id is not null and public.is_group_member(group_id, auth.uid()))
    )
  );

-- 작성자만 수정/삭제
drop policy if exists tx_update on public.transactions;
create policy tx_update on public.transactions
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists tx_delete on public.transactions;
create policy tx_delete on public.transactions
  for delete to authenticated using (created_by = auth.uid());
