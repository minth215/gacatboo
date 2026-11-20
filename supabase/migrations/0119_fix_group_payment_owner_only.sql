-- =====================================================================
-- 0119: 구독 그룹 결제 내역 수정 시 'record "new" has no field "type"' 오류 수정
--   · 0099 의 trg_group_payment_owner_only 가 subscription_payments(type 칸 없음)에도 걸리는데,
--     한 조건식 안에서 new.type 을 읽어 그 테이블 수정 때 오류가 났다. 테이블별로 조건을 나눠 검사.
--   · 동작(총무/총대만 결제 내역 입력·수정·삭제)은 0099 와 같음.
-- 0099 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.trg_group_payment_owner_only()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group bigint;
  v_owner uuid;
  v_category text;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb;
begin
  if v_uid is null then return coalesce(new, old); end if;
  v_row := coalesce(v_new, v_old);
  if tg_table_name = 'transactions' then
    -- 이름 스냅샷 갱신·표시 순서 같은 부수 변경은 허용(결제 내용이 그대로인 수정)
    if tg_op = 'UPDATE'
       and v_new->'type' is not distinct from v_old->'type' and v_new->'date' is not distinct from v_old->'date'
       and v_new->'amount' is not distinct from v_old->'amount' and v_new->'content' is not distinct from v_old->'content'
       and v_new->'memo' is not distinct from v_old->'memo' and v_new->'items' is not distinct from v_old->'items'
       and v_new->'group_id' is not distinct from v_old->'group_id' then
      return new;
    end if;
    -- 정산 그룹 결제 내역(그룹 지출)만
    if v_row->>'group_id' is null then return coalesce(new, old); end if;
    if coalesce(v_row->>'type', '') <> 'expense' then return coalesce(new, old); end if;
  end if;
  v_group := (v_row->>'group_id')::bigint;
  select owner_id, category into v_owner, v_category from public.groups where id = v_group;
  if v_owner is null then return coalesce(new, old); end if;
  if tg_table_name = 'transactions' and v_category is distinct from '정산' then return coalesce(new, old); end if;
  if v_owner <> v_uid then
    raise exception '결제 내역은 총무/총대만 입력·수정할 수 있습니다.';
  end if;
  return coalesce(new, old);
end;
$$;
