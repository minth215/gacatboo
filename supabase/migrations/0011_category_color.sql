-- =====================================================================
-- 0011: 분류(수입/지출)에 아이콘 배경색 설정 추가
--   · categories.color — 사용자가 지정한 배경색(hex). 비어있으면 기존처럼
--     분류명 해시로 파스텔 톤을 자동 선택(클라이언트 tileBg)
--   · transactions.category_color — 가계부 표시용 스냅샷(분류명/이모지와 동일 패턴)
-- 0001~0010 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.categories   add column if not exists color text not null default '';
alter table public.transactions add column if not exists category_color text not null default '';
