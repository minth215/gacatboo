-- =====================================================================
-- 0029: 그룹 삭제 시 결제/입금 미러 거래(개인 가계부)도 함께 삭제
--   · subscription_payments/deposits 는 group_id FK 가 cascade 라 그룹과
--     함께 삭제되지만, 그 미러로 생성된 transactions 행은 group_id 가
--     항상 null 이고 origin_group_id(FK 아님)로만 그룹을 가리키고 있어서
--     그룹을 삭제해도 가계부에 고아 상태로 남는 문제를 고친다.
--   · 이미 이런 식으로 남아버린 기존 고아 행도 한 번에 정리한다.
-- 0001~0028 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 이미 삭제된 그룹을 origin_group_id 로 가리키고 있는 기존 고아 미러 거래 정리
delete from public.transactions
where origin_group_id is not null
  and not exists (select 1 from public.groups g where g.id = transactions.origin_group_id);

-- 그룹 삭제 시 origin_group_id 로 연결된 미러 거래도 함께 삭제
create or replace function public.cleanup_group_mirror_transactions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.transactions where origin_group_id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists trg_cleanup_group_mirror_transactions on public.groups;
create trigger trg_cleanup_group_mirror_transactions
  before delete on public.groups
  for each row execute function public.cleanup_group_mirror_transactions();
