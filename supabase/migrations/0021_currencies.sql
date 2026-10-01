-- =====================================================================
-- 0021: 화폐 설정(보조 화폐)
--   · user_currencies — 사용자가 추가한 보조 화폐 목록(USD/JPY/INR 등). 주 화폐(원화)는
--     별도 행 없이 항상 기본값으로 취급(categories/sources 와 동일한 "사용자 소유 목록" 패턴).
--   · transactions.input_currency/input_amount/fx_rate — 외화로 입력했을 때의 원본 통화·금액·
--     적용 환율 스냅샷. amount(원화, 기존 컬럼)는 항상 최종 저장값이고 이 세 컬럼은 참고용.
-- 0001~0020 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.user_currencies (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  code       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, code)
);
create index if not exists idx_user_currencies_user on public.user_currencies(user_id);

alter table public.user_currencies enable row level security;
drop policy if exists user_currencies_all on public.user_currencies;
create policy user_currencies_all on public.user_currencies
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.transactions add column if not exists input_currency text not null default '';
alter table public.transactions add column if not exists input_amount   numeric;
alter table public.transactions add column if not exists fx_rate        numeric;
