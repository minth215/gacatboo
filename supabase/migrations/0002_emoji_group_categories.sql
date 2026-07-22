-- =====================================================================
-- 0002: 분류 이모지 + 그룹 카테고리 사용자 편집
-- 기존 프로젝트라면 이 파일을 SQL Editor 에 붙여넣어 실행하세요.
-- (0001 을 먼저 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다.)
-- =====================================================================

-- 1) 분류 이모지 컬럼
alter table public.categories   add column if not exists emoji text not null default '';
-- 2) 스냅샷용 이모지 (가계부/그룹 카드 표시)
alter table public.transactions add column if not exists category_emoji text not null default '';
alter table public.groups       add column if not exists category_emoji text not null default '';

-- 3) 그룹 카테고리를 자유 텍스트로 (기존 CHECK 제약 제거)
alter table public.groups drop constraint if exists groups_category_check;

-- 4) 사용자별 그룹 카테고리 선택지 테이블
create table if not exists public.group_categories (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  emoji      text not null default '',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_group_categories_user on public.group_categories(user_id);

alter table public.group_categories enable row level security;
drop policy if exists group_categories_all on public.group_categories;
create policy group_categories_all on public.group_categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) 신규 가입 시드 함수 갱신 (이모지 포함 분류 + 그룹 카테고리)
create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inc_n text[] := array['월급','부수입','용돈','금융소득'];
  inc_e text[] := array['💰','💵','🪙','📈'];
  exp_n text[] := array['식당','교통','쇼핑','문화생활','통신','보험','병원','교육','구독','기타'];
  exp_e text[] := array['🍽️','🚌','🛍️','🎬','📱','🛡️','🏥','📚','🔁','📦'];
  src   text[] := array['현금','은행','카드','기타'];
  gc_n  text[] := array['여행','구독','동거','N빵','기타'];
  gc_e  text[] := array['✈️','🔁','🏠','🍕','📦'];
  i int;
begin
  for i in 1 .. array_length(inc_n,1) loop
    insert into public.categories(user_id, type, name, emoji, sort_order) values (uid, 'income', inc_n[i], inc_e[i], i-1);
  end loop;
  for i in 1 .. array_length(exp_n,1) loop
    insert into public.categories(user_id, type, name, emoji, sort_order) values (uid, 'expense', exp_n[i], exp_e[i], i-1);
  end loop;
  for i in 1 .. array_length(src,1) loop
    insert into public.sources(user_id, parent_id, name, sort_order) values (uid, null, src[i], i-1);
  end loop;
  for i in 1 .. array_length(gc_n,1) loop
    insert into public.group_categories(user_id, name, emoji, sort_order) values (uid, gc_n[i], gc_e[i], i-1);
  end loop;
end;
$$;

-- 6) 기존 사용자 백필 --------------------------------------------------

-- 6a) 그룹 카테고리가 하나도 없는 사용자에게 기본값 주입
insert into public.group_categories (user_id, name, emoji, sort_order)
select p.id, d.name, d.emoji, d.ord
from public.profiles p
cross join (values
  ('여행','✈️',0),('구독','🔁',1),('동거','🏠',2),('N빵','🍕',3),('기타','📦',4)
) as d(name, emoji, ord)
where not exists (select 1 from public.group_categories gc where gc.user_id = p.id);

-- 6b) 기존 기본 분류에 이모지 채우기 (이름이 기본값과 일치하고 이모지가 비어있는 경우만)
update public.categories c set emoji = m.emoji
from (values
  ('income','월급','💰'),('income','부수입','💵'),('income','용돈','🪙'),('income','금융소득','📈'),
  ('expense','식당','🍽️'),('expense','교통','🚌'),('expense','쇼핑','🛍️'),('expense','문화생활','🎬'),
  ('expense','통신','📱'),('expense','보험','🛡️'),('expense','병원','🏥'),('expense','교육','📚'),
  ('expense','구독','🔁'),('expense','기타','📦')
) as m(type, name, emoji)
where c.type = m.type and c.name = m.name and coalesce(c.emoji,'') = '';

-- 6c) 기존 그룹 카드 이모지 백필
update public.groups g set category_emoji = m.emoji
from (values ('여행','✈️'),('구독','🔁'),('동거','🏠'),('N빵','🍕'),('기타','📦')) as m(name, emoji)
where g.category = m.name and coalesce(g.category_emoji,'') = '';
