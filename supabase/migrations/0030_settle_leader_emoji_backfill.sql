-- =====================================================================
-- 0030: 정산 그룹 총대 수입 거래의 빈 이모지를 '정산' 수입 분류 이모지로 백필
--   · 멤버 "입금 완료"/총무 "정산 일괄 완료"로 생성된 총대 수입 내역이
--     leader_category_emoji를 빈 문자열로 저장해 와서, 이미 생성된
--     기존 행들은 카드에 기본(의도치 않은) 이모지로만 보이던 문제를 고친다.
--   · 클라이언트는 이번 배포부터 새로 생성되는 행에 올바른 이모지를 채움.
--     이 마이그레이션은 이미 저장된 기존 행만 대상으로 한다.
-- 0001~0029 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

update public.subscription_deposits d
set leader_category_emoji = c.emoji
from public.transactions t
join public.categories c on c.user_id = t.user_id and c.type = 'income' and c.name = '정산' and c.emoji <> ''
where t.id = d.leader_tx_id
  and d.leader_category_name = '정산'
  and coalesce(d.leader_category_emoji, '') = '';

update public.transactions t
set category_emoji = d.leader_category_emoji
from public.subscription_deposits d
where t.id = d.leader_tx_id
  and d.leader_category_name = '정산'
  and coalesce(t.category_emoji, '') = ''
  and coalesce(d.leader_category_emoji, '') <> '';
