-- =====================================================================
-- 0006: 멤버 상세 (다음 입금일 수동 지정) + 멤버 수정 RLS 보강
-- 0001~0005 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 다음 입금일 수동 지정(비우면 자동 계산)
alter table public.group_members add column if not exists next_due_override date;

-- group_members UPDATE 정책 누락 보강 — 총무/총대만 멤버 정보 수정 가능
drop policy if exists gm_update on public.group_members;
create policy gm_update on public.group_members
  for update to authenticated
  using (public.is_group_owner(group_id, auth.uid()))
  with check (public.is_group_owner(group_id, auth.uid()));
