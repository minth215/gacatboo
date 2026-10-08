-- 공금 그룹 "사용 내역"도 항상 공금 통장(그룹 생성 시 지정한 입금 수단)에서 나간 지출이므로,
-- 참여 멤버에게 미러링되는 개인 지출 거래에도 원천을 공금 통장 이름으로 남긴다.
-- (함수에 새 파라미터를 추가하므로 시그니처가 바뀌어 기존 함수를 먼저 지워야 한다.)
drop function if exists public.create_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb);
drop function if exists public.update_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb);

create or replace function public.create_pooled_fund_expense(
  p_group_id bigint, p_date date, p_amount bigint, p_content text, p_memo text,
  p_items jsonb, p_splits jsonb, p_source_name text default ''
) returns bigint
language plpgsql security definer set search_path = public as $cpfe$
declare
  v_uid uuid := auth.uid();
  v_expense_id bigint;
  v_split jsonb;
  v_member_uid uuid;
  v_tx bigint;
  v_source_id bigint;
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
      v_source_id := null;
      if coalesce(p_source_name,'') <> '' then
        select id into v_source_id from public.sources where user_id = v_member_uid and parent_id is null and name = p_source_name limit 1;
      end if;
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, source_id, source_name, content, memo, created_by, origin_type, origin_group_id)
      values (v_member_uid, null, 'expense', p_date, (v_split->>'amount')::bigint, '공금', v_source_id, coalesce(p_source_name,''), coalesce(p_content,''), '', v_uid, 'pooled_fund_expense', p_group_id)
      returning id into v_tx;
    end if;
    insert into public.pooled_fund_expense_members(expense_id, member_id, amount, transaction_id)
    values (v_expense_id, (v_split->>'member_id')::bigint, (v_split->>'amount')::bigint, v_tx);
  end loop;

  return v_expense_id;
end;
$cpfe$;
grant execute on function public.create_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb, text) to authenticated;

create or replace function public.update_pooled_fund_expense(
  p_id bigint, p_date date, p_amount bigint, p_content text, p_memo text,
  p_items jsonb, p_splits jsonb, p_source_name text default ''
) returns void
language plpgsql security definer set search_path = public as $upfe$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint;
  v_split jsonb;
  v_member_uid uuid;
  v_tx bigint;
  v_source_id bigint;
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
      v_source_id := null;
      if coalesce(p_source_name,'') <> '' then
        select id into v_source_id from public.sources where user_id = v_member_uid and parent_id is null and name = p_source_name limit 1;
      end if;
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, source_id, source_name, content, memo, created_by, origin_type, origin_group_id)
      values (v_member_uid, null, 'expense', p_date, (v_split->>'amount')::bigint, '공금', v_source_id, coalesce(p_source_name,''), coalesce(p_content,''), '', v_uid, 'pooled_fund_expense', v_group_id)
      returning id into v_tx;
    end if;
    insert into public.pooled_fund_expense_members(expense_id, member_id, amount, transaction_id)
    values (p_id, (v_split->>'member_id')::bigint, (v_split->>'amount')::bigint, v_tx);
  end loop;
end;
$upfe$;
grant execute on function public.update_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb, text) to authenticated;
