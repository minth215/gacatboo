-- =====================================================================
-- 0057: 즐겨찾기(자주 쓰는 기록 템플릿) 기능
--   · favorite_transactions — 기록 폼에서 "별" 아이콘으로 등록한, 분류/원천/내용/항목/금액
--     전체를 담은 템플릿. 날짜는 담지 않음(선택해서 쓸 때 항상 오늘 날짜로 들어감).
--   · 그룹 결제/입금/공금 같은 특수 기록 폼에는 노출하지 않으므로 group_id 는 없음(개인 전용).
-- 0001~0056 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.favorite_transactions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null check (type in ('income','expense','transfer')),
  amount         bigint not null default 0,
  category_id    bigint references public.categories(id) on delete set null,
  category_name  text not null default '',
  category_emoji text not null default '',
  category_color text not null default '',
  source_id      bigint references public.sources(id) on delete set null,
  source_name    text not null default '',
  to_source_id   bigint references public.sources(id) on delete set null,
  to_source_name text not null default '',
  content        text not null default '',
  memo           text not null default '',
  items          jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_favorite_tx_user on public.favorite_transactions(user_id);

alter table public.favorite_transactions enable row level security;
drop policy if exists favorite_transactions_all on public.favorite_transactions;
create policy favorite_transactions_all on public.favorite_transactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
