-- =====================================================================
-- 0112: 장바구니 하이퍼링크 정보
--   · link_name(링크명), show_thumb(썸네일 표시), thumb_url(링크 페이지의 대표 이미지, link-preview 함수로 가져옴)
-- 0001~0111 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.cart_items add column if not exists link_name text not null default '';
alter table public.cart_items add column if not exists show_thumb boolean not null default false;
alter table public.cart_items add column if not exists thumb_url text not null default '';
