-- =====================================================================
-- 0073: 내 정보 > 친구 검색 허용 / 그룹 초대 허용
--   · profiles.allow_friend_search: 끄면 친구 추가에서 아이디를 정확히 입력해도 "없는 회원"으로 보임
--   · profiles.allow_group_invite : 끄면 그룹 멤버로 추가될 때 초대장이 가지 않고 외부 멤버로 추가됨
--     (이미 친구로 등록돼 있어도 동일)
--   · 본인만 바꿀 수 있도록 set_my_privacy RPC 로 변경
-- 0001~0072 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.profiles add column if not exists allow_friend_search boolean not null default true;
alter table public.profiles add column if not exists allow_group_invite  boolean not null default true;

create or replace function public.set_my_privacy(p_allow_friend_search boolean, p_allow_group_invite boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  update public.profiles set
    allow_friend_search = coalesce(p_allow_friend_search, allow_friend_search),
    allow_group_invite  = coalesce(p_allow_group_invite, allow_group_invite)
  where id = auth.uid();
end;
$$;
grant execute on function public.set_my_privacy(boolean, boolean) to authenticated;
