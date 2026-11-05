-- =====================================================================
-- 0102: 회원 역할에 "테스터"(tester) 추가
-- 0001~0101 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user', 'tester'));
