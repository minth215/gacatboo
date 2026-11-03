-- =====================================================================
-- 0076: 할부 기록 묶음
--   · 한 번에 만든 할부 기록들을 같은 installment_group 값으로 묶어
--     "할부 기록 전체 삭제" 시 함께 지울 수 있게 한다.
-- 0001~0075 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists installment_group uuid;
create index if not exists transactions_installment_group_idx on public.transactions (installment_group) where installment_group is not null;
