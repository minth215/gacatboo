-- =====================================================================
-- 0117: 보조 화폐 원천의 환율 설정
--   · fx_mode: 'live'(실시간 환율, 기본) | 'book'(환전 시점 환율)
--   · fx_book_rate: 환전 시점 환율(외화 1단위당 원화). 환전(화폐가 다른 이체) 기록을 입력할 때마다
--     기존 잔액과 새로 환전한 금액으로 가중 평균해 앱이 갱신하며, 사용자가 직접 수정할 수도 있다.
-- 0116 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================
alter table public.sources add column if not exists fx_mode text not null default 'live';
alter table public.sources add column if not exists fx_book_rate numeric;
