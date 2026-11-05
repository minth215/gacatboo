-- =====================================================================
-- 0098: 일반 멤버의 "멤버 정보 수정"(내 닉네임·출금 수단) + 그룹 탈퇴
--   · update_my_group_member(멤버, 닉네임, 원천, 과거 입금 일괄 변경 여부)
--       닉네임 → group_members.self_nickname(총무/총대 외 멤버 화면의 입금 내역 이름도 이 값으로 보임)
--       원천   → withdraw_source_id. p_apply_past 면 과거 입금 내역·내 가계부 미러 기록의 원천도 일괄 변경
--   · leave_group(멤버, 유지 여부)
--       유지: 내 가계부의 그룹 미러 기록을 그룹과 분리(이후 그룹 입금 내역을 고쳐도 영향 없음)
--       삭제: 내 가계부의 그룹 미러 기록 삭제
--       멤버 행은 계정 연결을 끊어 "외부" 멤버로(총무/총대가 정한 닉네임으로 보임). 총무/총대는 탈퇴 불가.
-- 0001~0097 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.update_my_group_member(p_member_id bigint, p_nickname text, p_source_id bigint, p_apply_past boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m record;
  v_src record;
begin
  select * into m from public.group_members where id = p_member_id;
  if m.id is null or m.user_id is distinct from v_uid then raise exception '본인 멤버 정보만 수정할 수 있습니다.'; end if;
  select id, name into v_src from public.sources where id = p_source_id and user_id = v_uid;

  update public.group_members
  set self_nickname = nullif(btrim(coalesce(p_nickname, '')), ''), withdraw_source_id = v_src.id
  where id = p_member_id;

  if coalesce(p_apply_past, false) and v_src.id is not null then
    update public.subscription_deposits set source_id = v_src.id, source_name = v_src.name where member_id = p_member_id;
    update public.transactions set source_id = v_src.id, source_name = v_src.name
    where user_id = v_uid and origin_type = 'deposit' and type = 'expense' and origin_group_id = m.group_id;
  end if;
end;
$$;
grant execute on function public.update_my_group_member(bigint, text, bigint, boolean) to authenticated;

create or replace function public.leave_group(p_member_id bigint, p_keep boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m record;
  v_ids bigint[];
  v_username text;
begin
  select * into m from public.group_members where id = p_member_id;
  if m.id is null or m.user_id is distinct from v_uid then raise exception '본인만 탈퇴할 수 있습니다.'; end if;
  if m.role = 'owner' then raise exception '총무/총대는 그룹을 탈퇴할 수 없습니다.'; end if;

  -- 내 가계부의 이 그룹 미러 기록(입금·결제·공금 사용/이체 등)
  select array_agg(id) into v_ids from public.transactions
  where user_id = v_uid and origin_group_id = m.group_id and origin_type is not null;
  v_ids := coalesce(v_ids, '{}');

  -- 그룹 내역과의 연결 끊기(이후 그룹 쪽을 고쳐도 내 기록에 영향 없음)
  update public.subscription_deposits set member_tx_id = null where member_tx_id = any(v_ids);
  update public.subscription_deposits set leader_tx_id = null where leader_tx_id = any(v_ids);
  update public.subscription_payments set tx_id = null where tx_id = any(v_ids);
  update public.pooled_fund_expense_members set transaction_id = null where transaction_id = any(v_ids);
  update public.pooled_fund_transfers set member_tx_id = null where member_tx_id = any(v_ids);

  if coalesce(p_keep, false) then
    update public.transactions set origin_type = null, origin_id = null, origin_group_id = null, recurring_id = null
    where id = any(v_ids);
  else
    delete from public.transactions where id = any(v_ids);
  end if;

  -- 외부 멤버로(총무/총대가 정한 닉네임 유지, 표시용 아이디는 남김)
  select username into v_username from public.profiles where id = v_uid;
  update public.group_members
  set user_id = null, status = 'active', self_nickname = null, withdraw_source_id = null,
      external_username = coalesce(external_username, v_username)
  where id = p_member_id;
end;
$$;
grant execute on function public.leave_group(bigint, boolean) to authenticated;
