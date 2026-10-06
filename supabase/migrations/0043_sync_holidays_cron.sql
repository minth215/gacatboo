-- =====================================================================
-- 0043: kr_holidays 를 매달 자동으로 채워 넣는 pg_cron 작업
--   · sync-holidays Edge Function(Nager.Date API 호출, 키 불필요)을 매달 1일
--     UTC 01:00(KST 10:00)에 호출해 올해~2년 뒤 공휴일을 채운다.
--     이미 있는 날짜(0033/0042 에서 수동으로 다듬어 둔 라벨 포함)는 건드리지 않는다.
--   · Edge Function 을 호출하려면 service_role 키가 필요한데, 이 키를 마이그레이션
--     파일(git 에 커밋됨)에 그대로 적으면 안 되므로 Supabase Vault 에 암호화해서
--     저장해 두고, cron 작업은 Vault 에서 꺼내 쓴다.
--
--   ⚠️ 이 파일을 실행하기 전에 아래 두 가지를 먼저 해야 함:
--   1) Edge Function 배포: 프로젝트 루트에서
--        supabase functions deploy sync-holidays
--   2) service_role 키를 Vault 에 저장(최초 1회, SQL Editor에서 직접 실행 — 이 값은
--      파일로 커밋하지 말 것):
--        select vault.create_secret('<Settings > API 에서 복사한 service_role 키>', 'service_role_key');
--   3) 아래 cron.schedule 의 <PROJECT_REF> 를 Settings > API 에 보이는 프로젝트
--      참조 ID(https://<PROJECT_REF>.supabase.co)로 바꿔서 실행.
--
--   수동으로 지금 바로 한 번 돌려보고 싶다면 앱 쪽에서
--   supabase.functions.invoke('sync-holidays') 를 호출하거나, 대시보드의
--   Edge Functions > sync-holidays > Invoke 에서 테스트할 수 있다.
-- 0001~0042 이후 실행. 여러 번 실행해도 안전(이미 있으면 재등록만 함).
-- =====================================================================

create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-kr-holidays') then
    perform cron.unschedule('sync-kr-holidays');
  end if;
end $$;

select cron.schedule(
  'sync-kr-holidays',
  '0 1 1 * *', -- 매달 1일 UTC 01:00(KST 10:00)
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-holidays',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
