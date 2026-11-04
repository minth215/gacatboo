-- =====================================================================
-- 0092: 원천 이름 변경을 기록에 반영
--   · 기록·반복·즐겨찾기·그룹 결제/입금에 저장된 원천 이름(스냅샷)을 현재 원천 이름으로 한 번 맞춘다.
--     이후 이름 변경은 앱(db.updateSource)에서 함께 갱신.
-- 0001~0091 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

update public.transactions t set source_name = s.name from public.sources s where t.source_id = s.id and t.source_name is distinct from s.name;
update public.transactions t set to_source_name = s.name from public.sources s where t.to_source_id = s.id and t.to_source_name is distinct from s.name;
update public.recurring_rules r set source_name = s.name from public.sources s where r.source_id = s.id and r.source_name is distinct from s.name;
update public.recurring_rules r set to_source_name = s.name from public.sources s where r.to_source_id = s.id and r.to_source_name is distinct from s.name;
update public.favorite_transactions f set source_name = s.name from public.sources s where f.source_id = s.id and f.source_name is distinct from s.name;
update public.favorite_transactions f set to_source_name = s.name from public.sources s where f.to_source_id = s.id and f.to_source_name is distinct from s.name;
update public.subscription_payments p set source_name = s.name from public.sources s where p.source_id = s.id and p.source_name is distinct from s.name;
update public.subscription_deposits d set source_name = s.name from public.sources s where d.source_id = s.id and d.source_name is distinct from s.name;
