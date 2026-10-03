-- =====================================================================
-- 0036: 알림 템플릿에 정렬 순서(sort_order) 추가
--   관리자 페이지 "알림 관리" 탭에서 이모지를 핸들로 드래그 정렬할 수 있도록
--   다른 정렬 가능 목록(categories, sources, group_categories 등)과 동일한 패턴 적용.
-- 0035 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.notification_templates add column if not exists sort_order integer;

-- 기존 행은 id 순서를 그대로 초기 정렬값으로 사용. null 인 행만 채우므로 재실행해도
-- 이미 드래그로 바꾼 순서(0을 포함해)를 덮어쓰지 않는다.
update public.notification_templates set sort_order = id where sort_order is null;

alter table public.notification_templates alter column sort_order set not null;
alter table public.notification_templates alter column sort_order set default 0;

create index if not exists idx_notification_templates_sort on public.notification_templates(sort_order);
