-- =====================================================================
-- 0101: 탈퇴 후 다시 초대·수락하면 내 입금 내역 가계부 미러 복구
--   · 탈퇴 시 "유지"면 분리한 기록 id 를 subscription_deposits.detached_member_tx_id 에 기억.
--   · 다시 수락(accept_group_invite)하면 내 입금 내역 중 미러가 없는 것은
--       유지했던 기록이 남아 있으면 다시 연결, 없으면(삭제) 새로 만든다.
-- 0001~0100 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.subscription_deposits add column if not exists detached_member_tx_id bigint;

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
  -- 유지하면 분리한 기록 id 를 남겨 두었다가 다시 수락할 때 연결(삭제면 다시 수락할 때 새로 만듦)
  update public.subscription_deposits
  set detached_member_tx_id = case when coalesce(p_keep, false) then member_tx_id else null end, member_tx_id = null
  where member_tx_id = any(v_ids);
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

create or replace function public.accept_group_invite(p_member_id bigint, p_nickname text, p_source_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_src record;
  v_group bigint;
  d record;
  v_tx bigint;
begin
  perform public.respond_to_group_invite(p_member_id, true);
  select group_id into v_group from public.group_members where id = p_member_id;
  select id, name into v_src from public.sources where id = p_source_id and user_id = v_uid;

  update public.group_members
  set self_nickname = nullif(btrim(coalesce(p_nickname, '')), ''), withdraw_source_id = v_src.id
  where id = p_member_id and user_id = v_uid;

  if v_src.id is not null then
    -- 수락 전에 입력된 입금 내역: 비어 있는 멤버 원천을 채움(동기화 트리거가 미러 기록 원천 이름도 갱신)
    update public.subscription_deposits set source_id = v_src.id, source_name = v_src.name
    where member_id = p_member_id and coalesce(source_name, '') = '';
    update public.transactions set source_id = v_src.id, source_name = v_src.name
    where user_id = v_uid and origin_type = 'deposit' and type = 'expense' and origin_group_id = v_group and source_id is null;
  end if;

  -- 내 입금 내역의 가계부 미러 다시 연결/생성(탈퇴 후 재가입): 유지했던 기록이 있으면 다시 연결, 없으면 새로 만듦
  for d in select * from public.subscription_deposits where member_id = p_member_id and member_tx_id is null loop
    v_tx := null;
    if d.detached_member_tx_id is not null then
      select id into v_tx from public.transactions where id = d.detached_member_tx_id and user_id = v_uid;
    end if;
    if v_tx is not null then
      update public.transactions set origin_type = 'deposit', origin_id = d.id, origin_group_id = d.group_id where id = v_tx;
    else
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, category_emoji,
        source_id, source_name, content, memo, created_by, items, input_currency, input_amount, fx_rate, exclude_performance,
        origin_type, origin_id, origin_group_id)
      values (v_uid, null, 'expense', d.date, d.amount, coalesce(d.category_name, ''), coalesce(d.category_emoji, ''),
        coalesce(d.source_id, v_src.id), coalesce(nullif(d.source_name, ''), v_src.name, ''), coalesce(d.content, ''), coalesce(d.memo, ''), v_uid, d.items,
        coalesce(d.input_currency, ''), d.input_amount, d.fx_rate, coalesce(d.exclude_performance, false),
        'deposit', d.id, d.group_id)
      returning id into v_tx;
    end if;
    update public.subscription_deposits set member_tx_id = v_tx, detached_member_tx_id = null where id = d.id;
  end loop;
end;
$$;
grant execute on function public.accept_group_invite(bigint, text, bigint) to authenticated;
