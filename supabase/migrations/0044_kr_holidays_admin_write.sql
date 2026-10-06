-- =====================================================================
-- 0044: kr_holidays 에 관리자 쓰기 권한 추가
--   · 0034 에서 조회만 허용하고 "쓰기는 마이그레이션으로만 관리"했는데,
--     관리자 페이지에 공휴일 관리 탭(달력에서 직접 추가/삭제)을 만들면서
--     관리자 계정은 직접 추가/수정/삭제할 수 있어야 함.
-- 0001~0043 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

drop policy if exists kr_holidays_admin_insert on public.kr_holidays;
create policy kr_holidays_admin_insert on public.kr_holidays
  for insert to authenticated with check (public.is_admin(auth.uid()));

drop policy if exists kr_holidays_admin_update on public.kr_holidays;
create policy kr_holidays_admin_update on public.kr_holidays
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists kr_holidays_admin_delete on public.kr_holidays;
create policy kr_holidays_admin_delete on public.kr_holidays
  for delete to authenticated using (public.is_admin(auth.uid()));
