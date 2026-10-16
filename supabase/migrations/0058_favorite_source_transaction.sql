-- =====================================================================
-- 0058: 즐겨찾기 ↔ 원본 기록 연결
--   · favorite_transactions.source_transaction_id — 그 즐겨찾기가 어느 거래의 별 아이콘에서
--     등록됐는지(신규 작성 중에 등록한 경우는 null). 그 거래를 다시 열었을 때 별 아이콘이
--     이미 노란색(등록됨)으로 보이도록 조회하는 데 쓴다. 거래가 지워지면 null로 떨어짐
--     (즐겨찾기 자체는 그대로 남음 — 템플릿이라 원본과 독립적).
-- 0001~0057 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.favorite_transactions add column if not exists source_transaction_id bigint references public.transactions(id) on delete set null;
create index if not exists idx_favorite_tx_source on public.favorite_transactions(source_transaction_id);
