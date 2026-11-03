-- =====================================================================
-- 0081: 고정 해제도 기존 회원에게 반영
--   · 분류 기본값의 고정을 끄면, 같은 종류·이름의 기존 회원 분류도 고정을 풀어 삭제·이름 변경이 가능해진다.
--   · 고정 항목의 이름(또는 종류)을 바꾸면 옛 이름의 회원 분류는 고정을 풀고, 새 이름으로 다시 반영한다.
--   · 수입 "정산"은 정산 기능에 필요해 항상 고정으로 둔다.
-- 0001~0080 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.trg_default_category_locked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 고정이었던 옛 항목(해제됐거나 이름·종류가 바뀐 경우): 기존 회원 분류 고정 해제
  if tg_op = 'UPDATE' and old.locked
     and (not new.locked or old.name is distinct from new.name or old.type is distinct from new.type)
     and not (old.type = 'income' and old.name = '정산') then
    update public.categories set locked = false
    where type = old.type and name = old.name and locked;
  end if;
  -- 새로 고정됐거나 고정 항목의 이름·종류가 바뀐 경우: 기존 회원에게 반영
  if new.locked and (tg_op = 'INSERT' or not old.locked or old.name is distinct from new.name or old.type is distinct from new.type) then
    perform public.sync_locked_default_category(new.type, new.name, new.emoji, new.color);
  end if;
  return new;
end;
$$;
