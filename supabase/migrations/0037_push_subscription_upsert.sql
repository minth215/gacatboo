-- =====================================================================
-- 0037: 푸시 구독 등록을 RLS 우회 RPC로 처리
--   push_subscriptions.endpoint 는 브라우저/기기 단위로 전역에서 유일한데,
--   같은 기기에서 다른 계정으로 로그인해 푸시를 다시 켜면(= endpoint 재사용)
--   upsert 의 UPDATE 경로가 "기존 행 소유자 == 현재 로그인한 사용자" 를
--   요구하는 RLS(USING user_id = auth.uid())에 막혀
--   "new row violates row-level security policy ... push_subscriptions"
--   에러가 났다. 이 기기를 지금 로그인한 사용자 걸로 넘겨받는 것이 올바른
--   동작이므로, SECURITY DEFINER 함수로 명시적으로 처리한다.
-- 0036 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function public.upsert_push_subscription(text, text, text) to authenticated;
