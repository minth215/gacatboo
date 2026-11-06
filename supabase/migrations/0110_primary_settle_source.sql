-- =====================================================================
-- 0110: 주 정산 수단
--   · sources.is_primary_settle / default_sources.is_primary_settle — 사용자당 하나만 지정
--     (그룹의 정산 수단·공금 통장·입출금 수단 선택의 기본값으로 사용, 앱에서 처리)
--   · set_primary_source 에 'settle' 종류 추가, 신규 가입 기본값 복사에도 포함
-- 0001~0109 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources add column if not exists is_primary_settle boolean not null default false;
alter table public.default_sources add column if not exists is_primary_settle boolean not null default false;

create or replace function public.set_primary_source(p_source_id bigint, p_kind text, p_value boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_kind not in ('payment', 'deposit', 'settle') then raise exception '잘못된 종류입니다.'; end if;
  if not exists (select 1 from public.sources where id = p_source_id and user_id = v_uid) then
    raise exception '원천을 찾을 수 없습니다.';
  end if;
  if p_kind = 'payment' then
    if p_value then
      update public.sources set is_primary_payment = false where user_id = v_uid and is_primary_payment and id <> p_source_id;
      update public.sources set is_primary_payment = true where id = p_source_id;
    else
      update public.sources set is_primary_payment = false where id = p_source_id;
    end if;
  elsif p_kind = 'deposit' then
    if p_value then
      update public.sources set is_primary_deposit = false where user_id = v_uid and is_primary_deposit and id <> p_source_id;
      update public.sources set is_primary_deposit = true where id = p_source_id;
    else
      update public.sources set is_primary_deposit = false where id = p_source_id;
    end if;
  else
    if p_value then
      update public.sources set is_primary_settle = false where user_id = v_uid and is_primary_settle and id <> p_source_id;
      update public.sources set is_primary_settle = true where id = p_source_id;
    else
      update public.sources set is_primary_settle = false where id = p_source_id;
    end if;
  end if;
end;
$$;
grant execute on function public.set_primary_source(bigint, text, boolean) to authenticated;

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
    insert into public.sources(user_id, parent_id, name, group_type, is_primary_payment, is_primary_deposit, is_primary_settle, sort_order)
    values (uid, null, top.name, top.group_type, top.is_primary_payment, top.is_primary_deposit, top.is_primary_settle, top.sort_order)
    returning id into new_top;
    for child in select * from public.default_sources where parent_id = top.id order by sort_order, id loop
      insert into public.sources(user_id, parent_id, name, is_primary_payment, is_primary_deposit, is_primary_settle, sort_order)
      values (uid, new_top, child.name, child.is_primary_payment, child.is_primary_deposit, child.is_primary_settle, child.sort_order);
    end loop;
  end loop;

  for i in 1 .. array_length(gc_n,1) loop
    insert into public.group_categories(user_id, name, emoji, sort_order) values (uid, gc_n[i], '', i-1);
  end loop;
end;
$$;
