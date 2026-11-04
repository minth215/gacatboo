-- =====================================================================
-- 0082: 원천 세부 항목 상세(원천 관리 > 세부 항목 추가/수정 페이지)
--   · balance            — 일반 그룹 세부 항목의 금액(잔액)
--   · linked_source_id   — 신용카드/체크카드 그룹 세부 항목의 연결 계좌(카드값이 빠져나갈 원천, 카드 그룹 제외)
--   · payment_day        — 신용카드 그룹 세부 항목의 대금 납부일(매달 1~31일)
-- 0001~0081 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources add column if not exists balance bigint;
alter table public.sources add column if not exists linked_source_id bigint references public.sources(id) on delete set null;
alter table public.sources add column if not exists payment_day smallint;
do $$ begin
  alter table public.sources add constraint sources_payment_day_check check (payment_day is null or payment_day between 1 and 31);
exception when duplicate_object then null; end $$;
