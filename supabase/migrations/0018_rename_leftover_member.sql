-- =====================================================================
-- 0018: 자투리 가상 멤버 명칭 변경 '짤랑이' → '짤짤이'
--   · 이미 만들어진 가상 멤버 행의 닉네임을 바꾸고,
--   · 그 입금으로 총무 가계부에 생긴 수입 항목 내용("정산 - 짤랑이")도 함께 바꾼다.
-- 0001~0017 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

update public.transactions t
  set content = regexp_replace(t.content, ' - 짤랑이$', ' - 짤짤이')
  from public.subscription_deposits d
  join public.group_members gm on gm.id = d.member_id
  where d.leader_tx_id = t.id
    and gm.nickname = '짤랑이'
    and t.content like '% - 짤랑이';

update public.group_members set nickname = '짤짤이' where nickname = '짤랑이';
