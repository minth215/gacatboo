-- =====================================================================
-- 0008: 원천 표기를 세부 항목명만 남기기 (기존 데이터 정리)
--   "은행 > 우리은행" → "우리은행", "카드 > 삼성카드" → "삼성카드"
-- 0001~0007 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

update public.transactions
  set source_name = regexp_replace(source_name, '^.* > ', '')
  where source_name like '% > %';

update public.subscription_payments
  set source_name = regexp_replace(source_name, '^.* > ', '')
  where source_name like '% > %';

update public.subscription_deposits
  set source_name = regexp_replace(source_name, '^.* > ', '')
  where source_name like '% > %';

update public.subscription_deposits
  set deposit_source_name = regexp_replace(deposit_source_name, '^.* > ', '')
  where deposit_source_name like '% > %';
