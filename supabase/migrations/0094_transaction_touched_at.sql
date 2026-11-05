-- =====================================================================
-- 0094: 같은 날짜 기록의 표시 순서 = 마지막으로 저장(입력·수정)한 순
--   · transactions.touched_at: 기록을 입력하거나 기록 수정 화면에서 저장한 시각(내용을 안 바꿔도 갱신).
--     가계부·검색 목록은 날짜 내림차순 → touched_at 내림차순으로 보여 준다.
--   · 기존 기록은 입력 시각(created_at)으로 채움.
-- 0001~0093 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists touched_at timestamptz;
update public.transactions set touched_at = created_at where touched_at is null;
alter table public.transactions alter column touched_at set default now();
alter table public.transactions alter column touched_at set not null;
create index if not exists idx_tx_user_date_touched on public.transactions (user_id, date desc, touched_at desc);
