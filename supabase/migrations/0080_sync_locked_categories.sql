-- =====================================================================
-- 0080: 고정 분류를 기존 회원에게도 반영
--   · 분류 기본값에서 고정(locked) 항목을 추가하거나 고정으로 바꾸면, 같은 종류·이름의 분류가 없는
--     기존 회원에게 그 분류를 새로 만들어 주고(맨 뒤 순서), 이미 있는 회원은 고정으로 표시한다.
--   · 실행 시 현재 고정 기본값(수입 "정산" 포함)을 한 번 반영 → "정산"을 지운 회원도 다시 생긴다.
-- 0001~0079 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.sync_locked_default_category(p_type text, p_name text, p_emoji text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 이미 있는 회원: 고정으로 표시
  update public.categories set locked = true
  where type = p_type and name = p_name and not locked;
  -- 없는 회원: 새로 만들기(그 종류 분류의 맨 뒤)
  insert into public.categories(user_id, type, name, emoji, color, sort_order, locked)
  select p.id, p_type, p_name, coalesce(p_emoji, ''), coalesce(p_color, ''),
         coalesce((select max(c.sort_order) + 1 from public.categories c where c.user_id = p.id and c.type = p_type), 0),
         true
  from public.profiles p
  where not exists (select 1 from public.categories c where c.user_id = p.id and c.type = p_type and c.name = p_name);
end;
$$;
revoke execute on function public.sync_locked_default_category(text, text, text, text) from public, anon, authenticated;

-- 기본값이 고정으로 추가/변경되면 자동 반영(이름을 바꾼 고정 항목도 새 이름으로 반영)
create or replace function public.trg_default_category_locked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.locked and (tg_op = 'INSERT' or not old.locked or old.name is distinct from new.name or old.type is distinct from new.type) then
    perform public.sync_locked_default_category(new.type, new.name, new.emoji, new.color);
  end if;
  return new;
end;
$$;

drop trigger if exists default_category_locked_sync on public.default_categories;
create trigger default_category_locked_sync
  after insert or update on public.default_categories
  for each row execute function public.trg_default_category_locked();

-- 현재 고정 기본값 반영(수입 "정산"은 기본값에 없더라도 항상)
do $$
declare d record;
begin
  perform public.sync_locked_default_category('income', '정산', '🤝', '');
  for d in select * from public.default_categories where locked loop
    perform public.sync_locked_default_category(d.type, d.name, d.emoji, d.color);
  end loop;
end $$;
