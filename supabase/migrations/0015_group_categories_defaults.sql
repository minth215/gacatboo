-- =====================================================================
-- 0015: 그룹 카테고리 기본값을 "정산"/"구독" 2개로 축소, 이모지 제거
--   · 그룹 카테고리는 더 이상 이모지를 쓰지 않으므로(이름만 관리) 이모지를
--     비웁니다.
--   · 신규 가입자는 이제 "정산"/"구독" 두 카테고리만 기본으로 생성됩니다.
--   · 기존 사용자는 "정산"/"구독" 카테고리가 없으면 추가해 항상 존재하도록
--     보장합니다(그룹 상세 페이지의 정산/구독 탭 구성이 이 이름에 의존).
-- 0001~0014 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 1) 그룹 카테고리 이모지는 더 이상 사용하지 않으므로 전부 비움
update public.group_categories set emoji = '' where coalesce(emoji, '') <> '';

-- 2) 신규 가입 시드 함수 갱신: 그룹 카테고리는 "정산"/"구독" 두 개만, 이모지 없음
create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inc_n text[] := array['월급','부수입','용돈','금융소득','정산'];
  inc_e text[] := array['💰','💵','🪙','📈','🤝'];
  exp_n text[] := array['식당','교통','쇼핑','문화생활','통신','보험','병원','교육','구독','기타'];
  exp_e text[] := array['🍽️','🚌','🛍️','🎬','📱','🛡️','🏥','📚','🔁','📦'];
  src   text[] := array['현금','은행','카드','기타'];
  gc_n  text[] := array['정산','구독'];
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
    insert into public.group_categories(user_id, name, emoji, sort_order) values (uid, gc_n[i], '', i-1);
  end loop;
end;
$$;

-- 3) 기존 사용자 백필: "정산"/"구독" 그룹 카테고리가 없으면 추가(항상 존재하도록 보장)
insert into public.group_categories (user_id, name, emoji, sort_order)
select p.id, d.name, '', coalesce((select max(sort_order) + 1 from public.group_categories where user_id = p.id), 0)
from public.profiles p
cross join (values ('정산'), ('구독')) as d(name)
where not exists (
  select 1 from public.group_categories gc where gc.user_id = p.id and gc.name = d.name
);
