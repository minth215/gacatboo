-- =====================================================================
-- 0111: 장바구니(구매 예정 품목)
--   · cart_items: 내용·구매 예정일(없으면 미정)·분류·링크·항목(이름/수량/금액/체크)·메모
--     items = [{ name, qty, amount(null 가능), checked }]
--   · 가계부 작성으로 구매 완료하면 purchased_tx_id/purchased_at 기록(기록을 지우면 연결만 풀림)
--   · 본인 것만 조회/수정(RLS)
-- 0001~0110 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.cart_items (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content         text not null default '',
  planned_date    date,
  category_id     bigint references public.categories(id) on delete set null,
  category_name   text not null default '',
  category_emoji  text not null default '',
  link            text not null default '',
  items           jsonb not null default '[]'::jsonb,
  memo            text not null default '',
  purchased_tx_id bigint references public.transactions(id) on delete set null,
  purchased_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_cart_items_user on public.cart_items(user_id, planned_date);

alter table public.cart_items enable row level security;
drop policy if exists cart_items_own on public.cart_items;
create policy cart_items_own on public.cart_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
