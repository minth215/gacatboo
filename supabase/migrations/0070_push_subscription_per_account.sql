-- =====================================================================
-- 0070: 한 기기에서 여러 계정이 각자 푸시를 받을 수 있게
--   · 지금까지는 기기(endpoint)당 구독 행이 하나뿐이라, 같은 기기에서 다른 계정으로 전환해 푸시를
--     켜면 그 기기의 구독이 마지막 계정으로 "넘어가" 앞 계정은 "등록된 기기가 없습니다"가 됐다.
--   · endpoint 단독 유일 → (user_id, endpoint) 유일로 바꿔, 같은 기기라도 계정마다 구독 행을 둔다.
--   · upsert_push_subscription(): 지금 로그인한 계정의 행만 추가/갱신(다른 계정 행은 건드리지 않음).
-- 0001~0069 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
create unique index if not exists push_subscriptions_user_endpoint_key on public.push_subscriptions(user_id, endpoint);

create or replace function public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function public.upsert_push_subscription(text, text, text) to authenticated;
