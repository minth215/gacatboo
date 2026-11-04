-- =====================================================================
-- 0083: 원천은 세부 항목만 선택 + 디지털 온누리 그룹 특성
--   · 기록 등에서 원천 그룹은 고를 수 없고 세부 항목만 고른다. 세부 항목이 없는 원천 그룹(회원·기본값)에는
--     그룹 이름과 같은 세부 항목을 만들고, 그 그룹을 가리키던 기록·반복·즐겨찾기·그룹 결제/입금·구독 기본값·
--     연결 계좌·주결제/주입금 지정·카드 실적 구간을 새 세부 항목으로 옮긴다.
--   · group_type 에 'onnuri'(디지털 온누리) 추가.
--   · sources.onnuri_linked — 신용카드/체크카드 세부 항목의 "디지털 온누리 연결" 여부(기본 OFF).
-- 0001~0082 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources drop constraint if exists sources_group_type_check;
alter table public.sources add constraint sources_group_type_check check (group_type in ('general', 'credit', 'check', 'onnuri'));
alter table public.default_sources drop constraint if exists default_sources_group_type_check;
alter table public.default_sources add constraint default_sources_group_type_check check (group_type in ('general', 'credit', 'check', 'onnuri'));

alter table public.sources add column if not exists onnuri_linked boolean not null default false;

-- 회원: 세부 항목 없는 그룹 → 같은 이름의 세부 항목 생성 + 참조 이동
do $$
declare
  g record;
  child_id bigint;
begin
  for g in
    select s.* from public.sources s
    where s.parent_id is null
      and not exists (select 1 from public.sources c where c.parent_id = s.id)
  loop
    -- 주결제/주입금 지정은 세부 항목으로 옮김(사용자당 하나 제약 때문에 그룹 쪽을 먼저 해제)
    update public.sources set is_primary_payment = false, is_primary_deposit = false where id = g.id;
    insert into public.sources(user_id, parent_id, name, sort_order, is_primary_payment, is_primary_deposit)
    values (g.user_id, g.id, g.name, 0, g.is_primary_payment, g.is_primary_deposit)
    returning id into child_id;

    update public.transactions        set source_id = child_id    where source_id = g.id;
    update public.transactions        set to_source_id = child_id where to_source_id = g.id;
    update public.recurring_rules     set source_id = child_id    where source_id = g.id;
    update public.recurring_rules     set to_source_id = child_id where to_source_id = g.id;
    update public.favorite_transactions set source_id = child_id    where source_id = g.id;
    update public.favorite_transactions set to_source_id = child_id where to_source_id = g.id;
    update public.subscription_payments set source_id = child_id where source_id = g.id;
    update public.subscription_deposits set source_id = child_id where source_id = g.id;
    update public.subscriptions       set deposit_source_id = child_id where deposit_source_id = g.id;
    update public.sources             set linked_source_id = child_id where linked_source_id = g.id;
    update public.card_benefit_tiers  set source_id = child_id where source_id = g.id;
  end loop;
end $$;

-- 기본값: 세부 항목 없는 그룹 → 같은 이름의 세부 항목
do $$
declare g record;
begin
  for g in
    select s.* from public.default_sources s
    where s.parent_id is null
      and not exists (select 1 from public.default_sources c where c.parent_id = s.id)
  loop
    update public.default_sources set is_primary_payment = false, is_primary_deposit = false where id = g.id;
    insert into public.default_sources(parent_id, name, sort_order, is_primary_payment, is_primary_deposit)
    values (g.id, g.name, 0, g.is_primary_payment, g.is_primary_deposit);
  end loop;
end $$;
