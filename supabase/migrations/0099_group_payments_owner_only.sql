-- =====================================================================
-- 0099: 그룹 결제 내역은 총무/총대만 입력·수정·삭제(DB 에서도 막음)
--   · subscription_payments(구독/정산 그룹 결제 내역): 그룹 owner 가 아니면 insert/update/delete 거부.
--   · transactions 중 정산 그룹의 결제 내역(group_id 가 정산 그룹인 지출): owner 가 아니면 거부.
--   · 서버 자동 작업(pg_cron 등 auth.uid() 가 없는 경우)은 허용.
-- 0001~0098 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.trg_group_payment_owner_only()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group bigint;
  v_owner uuid;
  v_category text;
begin
  if v_uid is null then return coalesce(new, old); end if;
  -- 이름 스냅샷 갱신(원천·분류 이름 변경 반영)이나 표시 순서 같은 부수 변경은 허용: 결제 내용이 그대로인 수정
  if tg_op = 'UPDATE' and tg_table_name = 'transactions'
     and new.type is not distinct from old.type and new.date is not distinct from old.date
     and new.amount is not distinct from old.amount and new.content is not distinct from old.content
     and new.memo is not distinct from old.memo and new.items is not distinct from old.items
     and new.group_id is not distinct from old.group_id then
    return new;
  end if;
  if tg_table_name = 'subscription_payments' then
    v_group := coalesce(new.group_id, old.group_id);
  else
    -- transactions: 정산 그룹 결제 내역(그룹 지출)만
    if coalesce(new.group_id, old.group_id) is null then return coalesce(new, old); end if;
    if coalesce(new.type, old.type) <> 'expense' then return coalesce(new, old); end if;
    v_group := coalesce(new.group_id, old.group_id);
  end if;
  select owner_id, category into v_owner, v_category from public.groups where id = v_group;
  if v_owner is null then return coalesce(new, old); end if;
  if tg_table_name = 'transactions' and v_category is distinct from '정산' then return coalesce(new, old); end if;
  if v_owner <> v_uid then
    raise exception '결제 내역은 총무/총대만 입력·수정할 수 있습니다.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists group_payment_owner_only on public.subscription_payments;
create trigger group_payment_owner_only before insert or update or delete on public.subscription_payments
  for each row execute function public.trg_group_payment_owner_only();

drop trigger if exists group_payment_owner_only on public.transactions;
create trigger group_payment_owner_only before insert or update or delete on public.transactions
  for each row execute function public.trg_group_payment_owner_only();
