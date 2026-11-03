-- =====================================================================
-- 0078: 분류·원천 기본값(관리자 > 기타 관리)
--   · default_categories / default_sources — 새로 가입한 회원에게 처음 만들어 줄 분류·원천 목록.
--     관리자만 수정, 로그인 사용자는 읽기만.
--   · seed_user_defaults 가 고정 배열 대신 이 테이블을 복사하도록 변경(그룹 카테고리는 그대로).
--   · 처음 실행 시 기존 고정 기본값으로 채운다.
-- 0001~0077 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.default_categories (
  id         bigint generated always as identity primary key,
  type       text not null check (type in ('income','expense')),
  name       text not null,
  emoji      text not null default '',
  color      text not null default '',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.default_sources (
  id                 bigint generated always as identity primary key,
  parent_id          bigint references public.default_sources(id) on delete cascade,
  name               text not null,
  group_type         text not null default 'general' check (group_type in ('general','credit','check')),
  is_primary_payment boolean not null default false,
  is_primary_deposit boolean not null default false,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now()
);

alter table public.default_categories enable row level security;
alter table public.default_sources enable row level security;

drop policy if exists default_categories_read on public.default_categories;
create policy default_categories_read on public.default_categories for select to authenticated using (true);
drop policy if exists default_categories_admin on public.default_categories;
create policy default_categories_admin on public.default_categories for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists default_sources_read on public.default_sources;
create policy default_sources_read on public.default_sources for select to authenticated using (true);
drop policy if exists default_sources_admin on public.default_sources;
create policy default_sources_admin on public.default_sources for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 기존 고정 기본값으로 초기 데이터(비어 있을 때만)
do $$
declare
  inc_n text[] := array['월급','부수입','용돈','금융소득','정산'];
  inc_e text[] := array['💰','💵','🪙','📈','🤝'];
  exp_n text[] := array['식당','교통','쇼핑','문화생활','통신','보험','병원','교육','구독','기타'];
  exp_e text[] := array['🍽️','🚌','🛍️','🎬','📱','🛡️','🏥','📚','🔁','📦'];
  src   text[] := array['현금','은행','카드','기타'];
  i int;
begin
  if not exists (select 1 from public.default_categories) then
    for i in 1 .. array_length(inc_n,1) loop
      insert into public.default_categories(type, name, emoji, sort_order) values ('income', inc_n[i], inc_e[i], i-1);
    end loop;
    for i in 1 .. array_length(exp_n,1) loop
      insert into public.default_categories(type, name, emoji, sort_order) values ('expense', exp_n[i], exp_e[i], i-1);
    end loop;
  end if;
  if not exists (select 1 from public.default_sources) then
    for i in 1 .. array_length(src,1) loop
      insert into public.default_sources(parent_id, name, sort_order) values (null, src[i], i-1);
    end loop;
  end if;
end $$;

-- 신규 가입자 기본값: 기본값 테이블 복사(원천은 그룹 → 세부 항목 순으로 부모 id 를 이어 줌)
create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gc_n text[] := array['정산','구독','공금'];
  i int;
  top record;
  child record;
  new_top bigint;
begin
  insert into public.categories(user_id, type, name, emoji, color, sort_order)
  select uid, type, name, emoji, color, sort_order from public.default_categories order by type, sort_order, id;

  for top in select * from public.default_sources where parent_id is null order by sort_order, id loop
    insert into public.sources(user_id, parent_id, name, group_type, is_primary_payment, is_primary_deposit, sort_order)
    values (uid, null, top.name, top.group_type, top.is_primary_payment, top.is_primary_deposit, top.sort_order)
    returning id into new_top;
    for child in select * from public.default_sources where parent_id = top.id order by sort_order, id loop
      insert into public.sources(user_id, parent_id, name, is_primary_payment, is_primary_deposit, sort_order)
      values (uid, new_top, child.name, child.is_primary_payment, child.is_primary_deposit, child.sort_order);
    end loop;
  end loop;

  for i in 1 .. array_length(gc_n,1) loop
    insert into public.group_categories(user_id, name, emoji, sort_order) values (uid, gc_n[i], '', i-1);
  end loop;
end;
$$;
