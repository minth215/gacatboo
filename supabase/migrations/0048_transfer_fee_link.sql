-- 이체 기록에 수수료를 추가하면, 이체 기록과 별도의 지출(수수료) 기록이 함께 생기고 서로 연결된다.
-- 이체 기록을 지우면 연결된 수수료 지출 기록도 함께 지워지도록 on delete cascade.
alter table public.transactions add column if not exists linked_transaction_id bigint references public.transactions(id) on delete cascade;
create index if not exists idx_tx_linked on public.transactions(linked_transaction_id);
