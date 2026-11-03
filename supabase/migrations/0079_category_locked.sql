-- =====================================================================
-- 0079: 고정 분류(삭제·이름 변경 불가)
--   · categories.locked / default_categories.locked — 고정 항목. 관리자가 분류 기본값 관리에서 지정하면
--     새 가입자의 분류에 그대로 복사된다.
--   · 수입 "정산"은 정산 기능이 이름으로 찾는 분류라 기존 회원·기본값 모두 고정으로 표시.
-- 0001~0078 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.categories add column if not exists locked boolean not null default false;
alter table public.default_categories add column if not exists locked boolean not null default false;

update public.categories set locked = true where type = 'income' and name = '정산' and not locked;
update public.default_categories set locked = true where type = 'income' and name = '정산' and not locked;

create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gc_n text[] := array['정산','구독','공금'];
  i int;
  top record;
  child record;
  new_top bigint;
begin
  insert into public.categories(user_id, type, name, emoji, color, sort_order, locked)
  select uid, type, name, emoji, color, sort_order, locked from public.default_categories order by type, sort_order, id;

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
