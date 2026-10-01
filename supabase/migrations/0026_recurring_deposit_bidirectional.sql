-- =====================================================================
-- 0026: 그룹에서 만든 입금 반복 규칙을 상대방도 조회·삭제할 수 있도록 확장
--   · 입금 반복(target='subscription_deposit')은 "총대 수입" + "멤버 지출"이 동시에 걸린
--     하나의 규칙이라, 누가 만들었든(총대가 멤버 대신 설정했든, 멤버가 직접 설정했든)
--     총대와 대상 멤버 양쪽 모두 자신의 "반복 관리"에서 보고 해제할 수 있어야 한다.
--   · 기존 recurring_rules_all 정책(만든 사람만 전체 권한)은 그대로 두고, 입금 반복에 한해
--     상대방에게 select/delete 를 추가로 허용하는 정책을 더한다. 크로스 테이블(groups/
--     group_members) 조회는 0001의 is_admin/is_group_member 와 동일하게 SECURITY DEFINER
--     헬퍼 함수로 감싸 RLS 재귀 문제를 피한다.
-- 0001~0025 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.is_deposit_rule_counterpart(rid bigint, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.recurring_rules r
    join public.groups g on g.id = r.group_id
    where r.id = rid and r.target = 'subscription_deposit' and g.owner_id = uid
  ) or exists (
    select 1 from public.recurring_rules r
    join public.group_members gm on gm.id = r.member_id
    where r.id = rid and r.target = 'subscription_deposit' and gm.user_id = uid
  );
$$;

drop policy if exists recurring_rules_deposit_counterpart_select on public.recurring_rules;
create policy recurring_rules_deposit_counterpart_select on public.recurring_rules
  for select to authenticated
  using (public.is_deposit_rule_counterpart(id, auth.uid()));

drop policy if exists recurring_rules_deposit_counterpart_delete on public.recurring_rules;
create policy recurring_rules_deposit_counterpart_delete on public.recurring_rules
  for delete to authenticated
  using (public.is_deposit_rule_counterpart(id, auth.uid()));
