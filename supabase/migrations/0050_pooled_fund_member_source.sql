-- 공금 그룹에 멤버가 초대되면, 총무가 그룹 생성 시 지정한 "공금 통장"(subscriptions.deposit_source_name)을
-- 그 멤버 자신의 원천 목록에도 자동으로 추가한다(이체 입력 시 입금 수단으로 선택할 수 있도록).
-- sources 의 RLS 는 본인(auth.uid() = user_id) 행만 쓸 수 있어 총무가 직접 멤버의 sources 에 쓸 수 없으므로
-- SECURITY DEFINER 로 그룹 소유자 권한만 확인하고 대신 써 준다.
create or replace function public.add_pooled_fund_source_for_member(p_group_id bigint, p_member_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_owner uuid;
  v_caller uuid := auth.uid();
begin
  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner is null then raise exception '그룹을 찾을 수 없습니다.'; end if;
  if v_caller is distinct from v_owner then raise exception '권한이 없습니다.'; end if;

  select coalesce(deposit_source_name, '') into v_name from public.subscriptions where group_id = p_group_id;
  if coalesce(v_name, '') = '' then return; end if; -- 공금 통장이 아직 지정 안 됨

  if not exists (select 1 from public.sources where user_id = p_member_user_id and parent_id is null and name = v_name) then
    insert into public.sources(user_id, parent_id, name, sort_order)
    values (
      p_member_user_id, null, v_name,
      coalesce((select max(sort_order) + 1 from public.sources where user_id = p_member_user_id and parent_id is null), 0)
    );
  end if;
end;
$$;
grant execute on function public.add_pooled_fund_source_for_member(bigint, uuid) to authenticated;
