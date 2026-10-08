-- =====================================================================
-- 0049: 그룹 카테고리에 "공금" 추가(정산/구독과 동일한 패턴, 0015 참고)
--   · 신규 가입자는 "정산"/"구독"/"공금" 세 카테고리를 기본으로 생성
--   · 기존 사용자는 "공금" 카테고리가 없으면 추가
-- =====================================================================

create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inc_n text[] := array['월급','부수입','용돈','금융소득','정산'];
  inc_e text[] := array['💰','💵','🪙','📈','🤝'];
  exp_n text[] := array['식당','교통','쇼핑','문화생활','통신','보험','병원','교육','구독','기타'];
  exp_e text[] := array['🍽️','🚌','🛍️','🎬','📱','🛡️','🏥','📚','🔁','📦'];
  src   text[] := array['현금','은행','카드','기타'];
  gc_n  text[] := array['정산','구독','공금'];
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

insert into public.group_categories (user_id, name, emoji, sort_order)
select p.id, '공금', '', coalesce((select max(sort_order) + 1 from public.group_categories where user_id = p.id), 0)
from public.profiles p
where not exists (
  select 1 from public.group_categories gc where gc.user_id = p.id and gc.name = '공금'
);
