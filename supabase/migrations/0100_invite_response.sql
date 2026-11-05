-- =====================================================================
-- 0100: 그룹 초대 알림 카드별 응답 기록
--   · notifications.invite_response('accepted' | 'declined') — 그 초대장 카드에 한 응답. 이후 그룹을
--     탈퇴하거나 다시 초대받아도 예전 카드는 "수락했어요/거절했어요" 상태를 유지하고, 수락/거절 버튼은
--     새 초대장 카드에만 뜬다.
--   · 기존 카드: 지금 그 그룹 멤버로 연결돼 있으면 'accepted' 로 채움.
-- 0001~0099 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.notifications add column if not exists invite_response text;

update public.notifications n
set invite_response = 'accepted'
from public.group_members m
where n.event_key = 'group_invite' and n.invite_response is null
  and (n.data->>'member_id') ~ '^[0-9]+$' and m.id = (n.data->>'member_id')::bigint
  and m.user_id = n.user_id and m.status = 'active';
