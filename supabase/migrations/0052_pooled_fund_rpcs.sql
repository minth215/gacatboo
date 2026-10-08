-- =====================================================================
-- 0052: 공금 그룹 "사용 내역"/"이체 내역" 입력 시 멤버 개인 가계부로 미러링하는 RPC
--   · create_subscription_deposit(0009) 의 미러링 패턴을 N명(사용 내역)과
--     1명(이체 내역)으로 확장한 버전. 계정이 없는("외부") 멤버는 개인 가계부가
--     없으므로 미러링을 건너뛰고 공금 그룹 내부 기록(아래 테이블)에만 남는다.
--   · 미러링된 transactions 행은 모두 group_id = null(개인 가계부에 보이도록),
--     origin_group_id 로 공금 그룹과 연결(기존 0029 삭제 정리 트리거와 동일 패턴).
-- 0001~0051 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.create_pooled_fund_expense(
  p_group_id bigint, p_date date, p_amount bigint, p_content text, p_memo text,
  p_items jsonb, p_splits jsonb -- p_splits: [{"member_id":1,"amount":1000}, ...]
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_expense_id bigint;
  v_split jsonb;
  v_member_uid uuid;
  v_tx bigint;
begin
  if not public.is_group_member(p_group_id, v_uid) then
    raise exception '권한이 없습니다.';
  end if;

  insert into public.pooled_fund_expenses(group_id, date, amount, content, memo, items, created_by)
  values (p_group_id, p_date, p_amount, coalesce(p_content,''), coalesce(p_memo,''), p_items, v_uid)
  returning id into v_expense_id;

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    select user_id into v_member_uid from public.group_members
      where id = (v_split->>'member_id')::bigint and group_id = p_group_id;
    v_tx := null;
    if v_member_uid is not null then
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, content, memo, created_by, origin_type, origin_group_id)
      values (v_member_uid, null, 'expense', p_date, (v_split->>'amount')::bigint, '공금', coalesce(p_content,''), '', v_uid, 'pooled_fund_expense', p_group_id)
      returning id into v_tx;
    end if;
    insert into public.pooled_fund_expense_members(expense_id, member_id, amount, transaction_id)
    values (v_expense_id, (v_split->>'member_id')::bigint, (v_split->>'amount')::bigint, v_tx);
  end loop;

  return v_expense_id;
end;
$$;
grant execute on function public.create_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb) to authenticated;

create or replace function public.update_pooled_fund_expense(
  p_id bigint, p_date date, p_amount bigint, p_content text, p_memo text,
  p_items jsonb, p_splits jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint;
  v_split jsonb;
  v_member_uid uuid;
  v_tx bigint;
begin
  select group_id into v_group_id from public.pooled_fund_expenses where id = p_id;
  if v_group_id is null then raise exception '사용 내역을 찾을 수 없습니다.'; end if;
  if not public.is_group_member(v_group_id, v_uid) then raise exception '권한이 없습니다.'; end if;

  delete from public.transactions where id in (
    select transaction_id from public.pooled_fund_expense_members where expense_id = p_id and transaction_id is not null
  );
  delete from public.pooled_fund_expense_members where expense_id = p_id;

  update public.pooled_fund_expenses
    set date = p_date, amount = p_amount, content = coalesce(p_content,''), memo = coalesce(p_memo,''), items = p_items
    where id = p_id;

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    select user_id into v_member_uid from public.group_members
      where id = (v_split->>'member_id')::bigint and group_id = v_group_id;
    v_tx := null;
    if v_member_uid is not null then
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, content, memo, created_by, origin_type, origin_group_id)
      values (v_member_uid, null, 'expense', p_date, (v_split->>'amount')::bigint, '공금', coalesce(p_content,''), '', v_uid, 'pooled_fund_expense', v_group_id)
      returning id into v_tx;
    end if;
    insert into public.pooled_fund_expense_members(expense_id, member_id, amount, transaction_id)
    values (p_id, (v_split->>'member_id')::bigint, (v_split->>'amount')::bigint, v_tx);
  end loop;
end;
$$;
grant execute on function public.update_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb) to authenticated;

create or replace function public.delete_pooled_fund_expense(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_group_id bigint;
begin
  select group_id into v_group_id from public.pooled_fund_expenses where id = p_id;
  if v_group_id is null then return; end if;
  if not public.is_group_member(v_group_id, v_uid) then raise exception '권한이 없습니다.'; end if;
  delete from public.transactions where id in (
    select transaction_id from public.pooled_fund_expense_members where expense_id = p_id and transaction_id is not null
  );
  delete from public.pooled_fund_expenses where id = p_id; -- 멤버 행은 cascade
end;
$$;
grant execute on function public.delete_pooled_fund_expense(bigint) to authenticated;

-- ---------- 이체 내역 ----------

create or replace function public.create_pooled_fund_transfer(
  p_group_id bigint, p_member_id bigint, p_date date, p_amount bigint,
  p_from_source_name text, p_content text, p_memo text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid; v_member_uid uuid;
  v_pool_name text; v_from_id bigint; v_to_id bigint;
  v_tx bigint; v_transfer_id bigint;
begin
  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner is null then raise exception '그룹을 찾을 수 없습니다.'; end if;
  select user_id into v_member_uid from public.group_members where id = p_member_id and group_id = p_group_id;
  if not found then raise exception '멤버를 찾을 수 없습니다.'; end if;
  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '이체 내역을 입력할 권한이 없습니다.';
  end if;

  select coalesce(deposit_source_name,'') into v_pool_name from public.subscriptions where group_id = p_group_id;

  v_tx := null;
  if v_member_uid is not null then
    select id into v_from_id from public.sources where user_id = v_member_uid and parent_id is null and name = p_from_source_name limit 1;
    select id into v_to_id from public.sources where user_id = v_member_uid and parent_id is null and name = v_pool_name limit 1;
    insert into public.transactions(
      user_id, group_id, type, date, amount, source_id, source_name, to_source_id, to_source_name,
      category_name, content, memo, created_by, origin_type, origin_group_id
    ) values (
      v_member_uid, null, 'transfer', p_date, p_amount, v_from_id, coalesce(p_from_source_name,''), v_to_id, v_pool_name,
      '이체', coalesce(p_content,''), coalesce(p_memo,''), v_uid, 'pooled_fund_transfer', p_group_id
    ) returning id into v_tx;
  end if;

  insert into public.pooled_fund_transfers(group_id, member_id, date, amount, from_source_name, content, memo, member_tx_id, created_by)
  values (p_group_id, p_member_id, p_date, p_amount, coalesce(p_from_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_tx, v_uid)
  returning id into v_transfer_id;

  return v_transfer_id;
end;
$$;
grant execute on function public.create_pooled_fund_transfer(bigint, bigint, date, bigint, text, text, text) to authenticated;

create or replace function public.update_pooled_fund_transfer(
  p_id bigint, p_date date, p_amount bigint, p_from_source_name text, p_content text, p_memo text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint; v_member_id bigint; v_member_uid uuid; v_owner uuid;
  v_tx bigint; v_pool_name text; v_from_id bigint; v_to_id bigint;
begin
  select group_id, member_id, member_tx_id into v_group_id, v_member_id, v_tx from public.pooled_fund_transfers where id = p_id;
  if v_group_id is null then raise exception '이체 내역을 찾을 수 없습니다.'; end if;
  select owner_id into v_owner from public.groups where id = v_group_id;
  select user_id into v_member_uid from public.group_members where id = v_member_id;
  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '권한이 없습니다.';
  end if;

  if v_tx is not null then
    select coalesce(deposit_source_name,'') into v_pool_name from public.subscriptions where group_id = v_group_id;
    select id into v_from_id from public.sources where user_id = v_member_uid and parent_id is null and name = p_from_source_name limit 1;
    select id into v_to_id from public.sources where user_id = v_member_uid and parent_id is null and name = v_pool_name limit 1;
    update public.transactions set
      date = p_date, amount = p_amount, source_id = v_from_id, source_name = coalesce(p_from_source_name,''),
      to_source_id = v_to_id, to_source_name = v_pool_name, content = coalesce(p_content,''), memo = coalesce(p_memo,'')
      where id = v_tx;
  end if;

  update public.pooled_fund_transfers set
    date = p_date, amount = p_amount, from_source_name = coalesce(p_from_source_name,''),
    content = coalesce(p_content,''), memo = coalesce(p_memo,'')
    where id = p_id;
end;
$$;
grant execute on function public.update_pooled_fund_transfer(bigint, date, bigint, text, text, text) to authenticated;

create or replace function public.delete_pooled_fund_transfer(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint; v_member_id bigint; v_member_uid uuid; v_owner uuid; v_tx bigint;
begin
  select group_id, member_id, member_tx_id into v_group_id, v_member_id, v_tx from public.pooled_fund_transfers where id = p_id;
  if v_group_id is null then return; end if;
  select owner_id into v_owner from public.groups where id = v_group_id;
  select user_id into v_member_uid from public.group_members where id = v_member_id;
  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '권한이 없습니다.';
  end if;
  if v_tx is not null then delete from public.transactions where id = v_tx; end if;
  delete from public.pooled_fund_transfers where id = p_id;
end;
$$;
grant execute on function public.delete_pooled_fund_transfer(bigint) to authenticated;
