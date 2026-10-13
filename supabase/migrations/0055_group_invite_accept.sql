-- =====================================================================
-- 0055: 그룹 멤버 추가를 "초대"로 바꿔 수락/거절 흐름 도입
--   · 아이디를 연결해 멤버를 추가하면 바로 멤버가 되는 대신 status='pending'으로 대기.
--   · 알림 페이지의 그룹 초대 알림에서 수락하면 status='active'로 전환돼 실제로 참여.
--   · 거절하면 멤버 행은 남지만 user_id를 비워 기존 "외부 멤버" 패턴으로 표기됨.
-- 0001~0054 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.group_members add column if not exists status text not null default 'active' check (status in ('active', 'pending'));

-- 그룹 데이터 공개 범위의 단일 관문. pending 상태는 멤버로 치지 않아 수락 전까지는
-- 그룹 거래/멤버 목록 등이 전혀 보이지 않는다(이 함수 하나만 바꾸면 이를 쓰는 모든
-- RLS 정책·RPC에 자동으로 반영됨).
create or replace function public.is_group_member(gid bigint, uid uuid)
returns boolean language sql security definer stable set search_path = public as $is_gm$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid and m.status = 'active');
$is_gm$;

-- 알림에 구조화된 부가 데이터(초대의 group_members.id 등)를 함께 저장할 수 있도록 컬럼 추가.
alter table public.notifications add column if not exists data jsonb;

drop function if exists public.notify_user(uuid, text, jsonb, text);

create or replace function public.notify_user(p_user_id uuid, p_event_key text, p_vars jsonb default '{}'::jsonb, p_link text default null, p_data jsonb default null)
returns bigint language plpgsql security definer set search_path = public as $notify_user$
declare
  t public.notification_templates;
  new_id bigint;
  v_group_id bigint;
begin
  if p_vars ? 'group_id' then
    v_group_id := (p_vars->>'group_id')::bigint;
    if not exists (
      select 1 from public.groups g
      where g.id = v_group_id
        and exists (select 1 from public.group_members gm1 where gm1.group_id = g.id and gm1.user_id = auth.uid())
        and exists (select 1 from public.group_members gm2 where gm2.group_id = g.id and gm2.user_id = p_user_id)
    ) then
      raise exception '알림을 보낼 권한이 없습니다.';
    end if;
  end if;

  select * into t from public.notification_templates where event_key = p_event_key and active;
  if not found then return null; end if;

  insert into public.notifications (user_id, event_key, title, body, emoji, color, link, data)
  values (p_user_id, p_event_key, public.fill_template(t.title_template, p_vars), public.fill_template(t.body_template, p_vars), t.emoji, t.color, p_link, p_data)
  returning id into new_id;

  return new_id;
end;
$notify_user$;

grant execute on function public.notify_user(uuid, text, jsonb, text, jsonb) to authenticated;

-- 초대 받은 사람 본인만, 아직 pending 인 초대에만 응답할 수 있다.
-- 수락: status를 active로 전환(+ 공금 그룹이면 공금 통장을 본인 원천에 자동 추가 — 기존에
--       멤버 추가 즉시 실행되던 add_pooled_fund_source_for_member 의 로직을 수락 시점으로 옮긴 것).
-- 거절: user_id를 비워 "외부 멤버"로 남긴다(삭제하지 않음 — 총무 쪽 기록은 유지).
create or replace function public.respond_to_group_invite(p_member_id bigint, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $respond_invite$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint; v_user_id uuid; v_status text; v_category text; v_dep_name text;
begin
  select group_id, user_id, status into v_group_id, v_user_id, v_status
    from public.group_members where id = p_member_id;
  if not found then raise exception '초대를 찾을 수 없습니다.'; end if;
  if v_user_id is distinct from v_uid then raise exception '본인에게 온 초대만 응답할 수 있습니다.'; end if;
  if v_status <> 'pending' then raise exception '이미 응답한 초대입니다.'; end if;

  if p_accept then
    update public.group_members set status = 'active' where id = p_member_id;

    select category into v_category from public.groups where id = v_group_id;
    if v_category = '공금' then
      select coalesce(deposit_source_name, '') into v_dep_name from public.subscriptions where group_id = v_group_id;
      if coalesce(v_dep_name, '') <> '' and not exists (
        select 1 from public.sources where user_id = v_uid and parent_id is null and name = v_dep_name
      ) then
        insert into public.sources(user_id, parent_id, name, sort_order)
        values (v_uid, null, v_dep_name, coalesce((select max(sort_order) + 1 from public.sources where user_id = v_uid and parent_id is null), 0));
      end if;
    end if;
  else
    update public.group_members set user_id = null, status = 'active' where id = p_member_id;
  end if;
end;
$respond_invite$;

grant execute on function public.respond_to_group_invite(bigint, boolean) to authenticated;

-- 알림 카드에서 초대 상태를 확인하기 위한 조회(초대받은 사람은 아직 is_group_member가
-- false라 group_members 를 직접 select 할 수 없으므로 SECURITY DEFINER로 상태만 내려줌).
create or replace function public.get_group_invite_status(p_member_id bigint)
returns table(status text, linked_to_me boolean)
language sql security definer stable set search_path = public as $invite_status$
  select m.status, (m.user_id = auth.uid()) from public.group_members m where m.id = p_member_id;
$invite_status$;

grant execute on function public.get_group_invite_status(bigint) to authenticated;
