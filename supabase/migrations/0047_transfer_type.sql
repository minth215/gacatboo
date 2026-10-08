-- 이체(계좌/통장 간 돈의 이동) 기록 기능 추가.
-- 이체는 수입/지출이 아니라 통계에 잡히지 않는 단순 이동이라 기존 source_id/source_name(출금)
-- 외에 입금 측 원천을 담을 컬럼이 따로 필요하다.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in ('income','expense','transfer'));

alter table public.transactions add column if not exists to_source_id bigint references public.sources(id) on delete set null;
alter table public.transactions add column if not exists to_source_name text not null default '';
