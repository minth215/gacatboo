-- 지출/수입 기록의 항목별 입력(내용/수량/금액 여러 행)을 그대로 저장해 수정 화면에서도
-- 다시 보이도록 함. 기존 레코드는 null(수정 화면에서는 기존처럼 금액 하나로만 복원됨).
alter table public.transactions add column if not exists items jsonb;
