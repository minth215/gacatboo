-- =====================================================================
-- 0067: 원천 그룹(최상위 원천)의 특성 — 일반 / 신용카드 / 체크카드
--   · sources.group_type: 'general'(일반, 기본) | 'credit'(신용카드) | 'check'(체크카드).
--     원천 관리에서 원천 그룹을 추가할 때 고른다(하위 원천에는 의미 없음).
-- 0001~0066 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources add column if not exists group_type text not null default 'general';
alter table public.sources drop constraint if exists sources_group_type_check;
alter table public.sources add constraint sources_group_type_check check (group_type in ('general', 'credit', 'check'));
