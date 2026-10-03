-- =====================================================================
-- 0034: kr_holidays 에 RLS 활성화
--   · 0033에서 공휴일 테이블을 만들 때 RLS를 켜지 않아 Supabase가
--     "anon/authenticated 키로 접근될 수 있음" 경고를 띄움.
--   · 공휴일 날짜는 사용자 구분 없는 공용 참고 데이터라 전체 조회만
--     허용하고(로그인한 사용자 전원), 쓰기는 막아 마이그레이션으로만
--     관리되게 한다.
-- 0001~0033 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.kr_holidays enable row level security;

drop policy if exists kr_holidays_select on public.kr_holidays;
create policy kr_holidays_select on public.kr_holidays
  for select to authenticated using (true);
