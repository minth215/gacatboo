-- =====================================================================
-- 0095: 그룹 입금·공금 내역 수정 시에도 같은 날짜 안에서 맨 위로
--   · 수정 저장한 입금 내역(총무·멤버 미러 기록), 공금 사용 내역(참여 멤버 미러 기록),
--     공금 이체 내역(멤버 미러 기록)의 touched_at 을 지금으로(다른 회원 기록이라 RPC 로 처리).
-- 0001~0094 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.touch_group_record_txs(p_kind text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_group bigint; v_ids bigint[];
begin
  if p_kind = 'deposit' then
    select group_id, array_remove(array[leader_tx_id, member_tx_id], null) into v_group, v_ids from public.subscription_deposits where id = p_id;
  elsif p_kind = 'pooled_expense' then
    select e.group_id, array_agg(m.transaction_id) filter (where m.transaction_id is not null) into v_group, v_ids
    from public.pooled_fund_expenses e left join public.pooled_fund_expense_members m on m.expense_id = e.id
    where e.id = p_id group by e.group_id;
  elsif p_kind = 'pooled_transfer' then
    select group_id, array_remove(array[member_tx_id], null) into v_group, v_ids from public.pooled_fund_transfers where id = p_id;
  else
    raise exception '알 수 없는 종류입니다.';
  end if;
  if v_group is null or not public.is_group_member(v_group, auth.uid()) then return; end if;
  update public.transactions set touched_at = now() where id = any(coalesce(v_ids, '{}'));
end;
$$;
grant execute on function public.touch_group_record_txs(text, bigint) to authenticated;
