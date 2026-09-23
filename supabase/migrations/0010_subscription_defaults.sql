-- =====================================================================
-- 0010: 구독 관리 설정에 기본값 추가
--   · 입금 내역 작성 시 총대의 원천 기본값 (deposit_source_id/name)
--   · 입금/결제 내역 작성 시 "내용" 기본값 템플릿 ({월} 등 날짜 변수 지원, 클라이언트에서 치환)
-- 0001~0009 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.subscriptions add column if not exists deposit_source_id        bigint references public.sources(id) on delete set null;
alter table public.subscriptions add column if not exists deposit_source_name      text   not null default '';
alter table public.subscriptions add column if not exists deposit_content_template text   not null default '';
alter table public.subscriptions add column if not exists payment_content_template text   not null default '';
