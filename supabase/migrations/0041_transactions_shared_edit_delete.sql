-- =====================================================================
-- 0041: 가계부 항목 수정/삭제 권한을 "작성자만"에서 "보이는 사람 전원"으로 완화
--   지금까지는 created_by = auth.uid() 인 사람만 수정/삭제할 수 있어, 그룹에서 다른
--   멤버가 등록한 반복 거래가 내 개인 가계부 화면에 비쳐 보여도(공유 그룹 항목) 밀어서
--   지울 수 없었다(화면은 눌러지는데 서버에서 막혀 조용히 실패하거나, 클라이언트가
--   아예 스와이프 자체를 막아둠).
--   이제 다음 중 하나만 만족하면 수정/삭제를 허용한다:
--     · created_by = auth.uid()            (내가 직접 등록)
--     · user_id = auth.uid()               (내 개인 가계부 귀속 항목 — 작성자가 달라도 내 것)
--     · group_id 가 있고 내가 그 그룹 멤버  (그룹에 공유된 항목은 멤버 누구나)
--   그룹 항목을 멤버 아무나 지우면 그 그룹을 보는 모두에게서 함께 사라진다(공유 삭제) —
--   의도된 동작.
-- 0001~0040 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

drop policy if exists tx_update on public.transactions;
create policy tx_update on public.transactions
  for update to authenticated
  using (
    created_by = auth.uid()
    or user_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
  )
  with check (
    created_by = auth.uid()
    or user_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
  );

drop policy if exists tx_delete on public.transactions;
create policy tx_delete on public.transactions
  for delete to authenticated using (
    created_by = auth.uid()
    or user_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
  );
