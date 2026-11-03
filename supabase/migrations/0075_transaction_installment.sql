-- =====================================================================
-- 0075: 할부 기록 회차 표시
--   · 기록 화면에서 할부(N개월)로 저장하면 금액을 나눠 매달 한 건씩 한 번에 만든다.
--     각 기록에 회차(installment_no)와 전체 개월 수(installment_total)를 남겨
--     기록 수정 화면의 반복 아이콘 자리에 (1/3) 처럼 표시한다.
-- 0001~0074 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists installment_no smallint;
alter table public.transactions add column if not exists installment_total smallint;
