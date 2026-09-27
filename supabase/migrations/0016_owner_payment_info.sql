-- =====================================================================
-- 0016: 정산 그룹 총무 입금 정보(계좌/토스/카카오페이 링크) 추가
--   · 정산 탭에서 미완료 멤버 본인이 자기 카드를 누르면 뜨는 송금 모달에서 사용.
-- 0001~0015 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.groups add column if not exists owner_account text not null default '';
alter table public.groups add column if not exists owner_toss_link text not null default '';
alter table public.groups add column if not exists owner_kakaopay_link text not null default '';
