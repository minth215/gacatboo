-- =====================================================================
-- 0003: 그룹 멤버 개편(외부 멤버) + 구독형 그룹(설정/결제/입금) + RPC
-- 0001, 0002 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) group_members 개편: 외부 멤버(계정 없는 사람) 지원 + 부가 정보
-- ---------------------------------------------------------------------
alter table public.group_members add column if not exists id         bigint generated always as identity;
alter table public.group_members add column if not exists nickname   text;
alter table public.group_members add column if not exists start_date date;
alter table public.group_members add column if not exists end_date   date;
alter table public.group_members add column if not exists contact    text;
alter table public.group_members alter column user_id drop not null;

-- 기존 복합 PK(group_id,user_id) → id 단일 PK 로 변경
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'group_members_pkey') then
    alter table public.group_members drop constraint group_members_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'group_members_id_pk') then
    alter table public.group_members add constraint group_members_id_pk primary key (id);
  end if;
end $$;

-- 계정 멤버는 그룹당 1회만
create unique index if not exists uq_group_members_user
  on public.group_members(group_id, user_id) where user_id is not null;

-- 기존 계정 멤버의 닉네임 백필
update public.group_members gm set nickname = p.display_name
from public.profiles p where gm.user_id = p.id and (gm.nickname is null or gm.nickname = '');

-- 멤버 메모(총무/총대만 열람) — 별도 테이블 + RLS
create table if not exists public.group_member_notes (
  member_id bigint primary key references public.group_members(id) on delete cascade,
  group_id  bigint not null references public.groups(id) on delete cascade,
  memo      text not null default ''
);
alter table public.group_member_notes enable row level security;
drop policy if exists gmn_owner_all on public.group_member_notes;
create policy gmn_owner_all on public.group_member_notes
  for all to authenticated
  using (public.is_group_owner(group_id, auth.uid()))
  with check (public.is_group_owner(group_id, auth.uid()));

-- ---------------------------------------------------------------------
-- 2) 구독 설정 (그룹당 1개)
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  group_id               bigint primary key references public.groups(id) on delete cascade,
  mode                   text   not null default 'personal' check (mode in ('personal','common')),
  billing_day            int,                          -- 정기결제일(일)
  billing_amount         bigint,                       -- 정기결제금액
  deposit_amount         bigint,                       -- 정기입금액
  period_unit            text   not null default 'month' check (period_unit in ('day','week','month','year')),
  period_count           int    not null default 1,
  deposit_category       text   not null default '',   -- 입금 분류(총대 수입 분류)
  deposit_category_emoji text   not null default '',
  updated_at             timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));
drop policy if exists subs_write on public.subscriptions;
create policy subs_write on public.subscriptions for all to authenticated
  using (public.is_group_owner(group_id, auth.uid()))
  with check (public.is_group_owner(group_id, auth.uid()));

-- ---------------------------------------------------------------------
-- 3) 결제 내역 (구독 결제 → 총대 개인 지출로 반영)
-- ---------------------------------------------------------------------
create table if not exists public.subscription_payments (
  id             bigint generated always as identity primary key,
  group_id       bigint not null references public.groups(id) on delete cascade,
  date           date   not null,
  amount         bigint not null check (amount >= 0),
  category_name  text   not null default '구독',
  category_emoji text   not null default '',
  source_id      bigint references public.sources(id) on delete set null,
  source_name    text   not null default '',
  content        text   not null default '',
  memo           text   not null default '',
  tx_id          bigint references public.transactions(id) on delete set null, -- 총대 개인 지출 tx
  created_by     uuid   references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_sub_pay_group_date on public.subscription_payments(group_id, date);
alter table public.subscription_payments enable row level security;
drop policy if exists subpay_select on public.subscription_payments;
create policy subpay_select on public.subscription_payments for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));
drop policy if exists subpay_write on public.subscription_payments;
create policy subpay_write on public.subscription_payments for all to authenticated
  using (public.is_group_owner(group_id, auth.uid()))
  with check (public.is_group_owner(group_id, auth.uid()));

-- ---------------------------------------------------------------------
-- 4) 입금 내역 (멤버 입금 → 총대 수입 + 멤버 지출로 반영)
-- ---------------------------------------------------------------------
create table if not exists public.subscription_deposits (
  id                  bigint generated always as identity primary key,
  group_id            bigint not null references public.groups(id) on delete cascade,
  member_id           bigint not null references public.group_members(id) on delete cascade,
  date                date   not null,
  amount              bigint not null check (amount >= 0),
  periods             int    not null default 1,       -- 기간(회차)
  category_name       text   not null default '',      -- 멤버 지출 분류
  category_emoji      text   not null default '',
  source_id           bigint references public.sources(id) on delete set null, -- 멤버 원천
  source_name         text   not null default '',
  deposit_source_name text   not null default '',      -- 입금수단(=총대의 원천)
  content             text   not null default '',
  memo                text   not null default '',
  leader_tx_id        bigint references public.transactions(id) on delete set null, -- 총대 수입 tx
  member_tx_id        bigint references public.transactions(id) on delete set null, -- 멤버 지출 tx(계정 멤버)
  created_by          uuid   references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_sub_dep_group_date on public.subscription_deposits(group_id, date);
create index if not exists idx_sub_dep_member on public.subscription_deposits(member_id);
alter table public.subscription_deposits enable row level security;
-- 조회: 그룹 멤버. 쓰기는 RPC(SECURITY DEFINER)로만 → 직접 write 정책은 두지 않음.
drop policy if exists subdep_select on public.subscription_deposits;
create policy subdep_select on public.subscription_deposits for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- ---------------------------------------------------------------------
-- 5) 입금 생성/삭제 RPC (교차 사용자 가계부 기입은 definer 로 처리)
-- ---------------------------------------------------------------------
create or replace function public.create_subscription_deposit(
  p_group_id bigint,
  p_member_id bigint,
  p_date date,
  p_amount bigint,
  p_periods int,
  p_category_name text,
  p_category_emoji text,
  p_source_id bigint,
  p_source_name text,
  p_deposit_source_name text,
  p_content text,
  p_memo text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_member_uid uuid;
  v_nickname  text;
  v_dep_cat   text;
  v_dep_emoji text;
  v_leader_tx bigint;
  v_member_tx bigint;
  v_dep_id    bigint;
begin
  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner is null then raise exception '그룹을 찾을 수 없습니다.'; end if;

  select user_id, coalesce(nullif(nickname,''), '멤버') into v_member_uid, v_nickname
  from public.group_members where id = p_member_id and group_id = p_group_id;
  if not found then raise exception '멤버를 찾을 수 없습니다.'; end if;

  -- 권한: 총대(소유자) 또는 본인(계정 멤버)
  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '입금을 입력할 권한이 없습니다.';
  end if;

  select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'')
  into v_dep_cat, v_dep_emoji from public.subscriptions where group_id = p_group_id;

  -- 총대 수입 tx (내용 "{내용} - {닉네임}", 분류 = 입금 분류)
  insert into public.transactions(user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by)
  values (v_owner, null, 'income', p_date, p_amount, coalesce(v_dep_cat,''), coalesce(v_dep_emoji,''),
          coalesce(p_deposit_source_name,''), coalesce(p_content,'') || ' - ' || v_nickname, coalesce(p_memo,''), v_uid)
  returning id into v_leader_tx;

  -- 멤버 지출 tx (계정 멤버만)
  if v_member_uid is not null then
    insert into public.transactions(user_id, group_id, type, date, amount, category_id, category_name, category_emoji, source_id, source_name, content, memo, created_by)
    values (v_member_uid, null, 'expense', p_date, p_amount, null, coalesce(p_category_name,''), coalesce(p_category_emoji,''),
            p_source_id, coalesce(p_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_uid)
    returning id into v_member_tx;
  end if;

  insert into public.subscription_deposits(
    group_id, member_id, date, amount, periods, category_name, category_emoji,
    source_id, source_name, deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by)
  values (p_group_id, p_member_id, p_date, p_amount, greatest(coalesce(p_periods,1),1),
          coalesce(p_category_name,''), coalesce(p_category_emoji,''), p_source_id, coalesce(p_source_name,''),
          coalesce(p_deposit_source_name,''), coalesce(p_content,''), coalesce(p_memo,''),
          v_leader_tx, v_member_tx, v_uid)
  returning id into v_dep_id;

  return v_dep_id;
end;
$$;

create or replace function public.delete_subscription_deposit(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_member_uid uuid;
  v_dep   record;
begin
  select d.*, g.owner_id as owner_id, gm.user_id as member_uid
  into v_dep
  from public.subscription_deposits d
  join public.groups g on g.id = d.group_id
  join public.group_members gm on gm.id = d.member_id
  where d.id = p_id;
  if not found then raise exception '입금 내역을 찾을 수 없습니다.'; end if;

  if v_uid <> v_dep.owner_id and (v_dep.member_uid is null or v_uid <> v_dep.member_uid) then
    raise exception '삭제 권한이 없습니다.';
  end if;

  if v_dep.leader_tx_id is not null then delete from public.transactions where id = v_dep.leader_tx_id; end if;
  if v_dep.member_tx_id is not null then delete from public.transactions where id = v_dep.member_tx_id; end if;
  delete from public.subscription_deposits where id = p_id;
end;
$$;

grant execute on function public.create_subscription_deposit(bigint,bigint,date,bigint,int,text,text,bigint,text,text,text,text) to authenticated;
grant execute on function public.delete_subscription_deposit(bigint) to authenticated;
