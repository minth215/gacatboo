-- =====================================================================
-- 0061: 반복 자동 등록 — 당일 회차만 생성 + 생성 시 알림(알림 센터 + 푸시)
--   · 0060 의 "놓친 회차 따라잡기"를 되돌린다: 매일 실행 때 오늘이 반복 날짜인 규칙만 생성
--     (예: 21일에는 매월 21일 규칙만. 전날 회차를 뒤늦게 만들지 않음). 규칙별 오류 격리는 유지.
--   · 회차가 생성되면 관련 사용자에게 알림을 남긴다(기존 템플릿 recurring_registered 사용):
--       - 일반/구독 결제 반복: 규칙을 만든 사람
--       - 구독 입금 반복: 총대와 해당 멤버(가계부에 각각 수입/지출이 기록되므로 둘 다)
--     알림 센터(notifications)에 바로 쌓고, 푸시는 send-push Edge Function 을 pg_net 으로 호출
--     (서비스 키로 호출 — Vault 의 service_role_key, 0043 에서 등록한 것과 같은 값).
--     푸시 수신 여부(전체 on/off, 상황별 on/off)는 send-push 가 확인한다.
--
--   ⚠️ 푸시까지 받으려면:
--     1) send-push Edge Function 재배포: supabase functions deploy send-push
--     2) Vault 에 service_role_key 가 있어야 함(0043 에서 이미 했다면 생략):
--          select vault.create_secret('<service_role 키>', 'service_role_key');
--     3) Edge Function 주소: 0043 의 sync-kr-holidays 작업에 적어 둔 주소를 그대로 쓰고,
--        그 작업이 없으면 Vault 의 project_url 을 쓴다(없을 때만 1회 등록):
--          select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--     위 설정이 없으면 푸시만 건너뛰고 알림 센터 기록은 그대로 남는다.
-- 0001~0060 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 알림 문구는 기존 "반복 항목 등록" 템플릿(recurring_registered)을 그대로 사용한다(관리자 알림 관리에서 수정).
-- 템플릿 변수: {group_name}(그룹 항목이면 그룹 이름, 개인 항목이면 '가계부'), {content}, {amount}
-- (이 파일의 이전 버전이 만들었을 수 있는 별도 템플릿은 정리)
delete from public.notification_templates where event_key = 'recurring_generated';

create extension if not exists pg_net with schema extensions;
alter table public.recurring_rules add column if not exists last_run_date date;

-- Edge Function 기본 주소(https://<ref>.supabase.co). 없으면 null.
create or replace function public._functions_base_url()
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  begin
    select decrypted_secret into v from vault.decrypted_secrets where name = 'project_url' limit 1;
  exception when others then v := null;
  end;
  if v is null then
    begin
      select substring(command from 'https://[A-Za-z0-9-]+\.supabase\.co') into v
        from cron.job where jobname = 'sync-kr-holidays' limit 1;
    exception when others then v := null;
    end;
  end if;
  return nullif(rtrim(v, '/'), '');
end;
$$;

-- 알림 한 건: 알림 센터 기록 + (가능하면) 푸시 요청. 실패해도 반복 생성에는 영향 없음.
create or replace function public.notify_recurring_generated(p_user_id uuid, p_vars jsonb, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.notification_templates;
  v_url text;
  v_key text;
begin
  if p_user_id is null then return; end if;
  select * into t from public.notification_templates where event_key = 'recurring_registered' and active;
  if not found then return; end if;

  insert into public.notifications (user_id, event_key, title, body, emoji, color, link)
  values (p_user_id, 'recurring_registered', public.fill_template(t.title_template, p_vars), public.fill_template(t.body_template, p_vars), t.emoji, t.color, p_link);

  begin
    v_url := public._functions_base_url();
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
    if v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/send-push',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('userId', p_user_id, 'eventKey', 'recurring_registered', 'vars', p_vars, 'link', p_link)
      );
    end if;
  exception when others then
    raise warning 'recurring push failed for %: %', p_user_id, sqlerrm;
  end;
end;
$$;

create or replace function public.generate_due_recurring_transactions()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  r public.recurring_rules;
  v_vars jsonb;
  v_link text;
  v_owner uuid;
  v_member uuid;
begin
  for r in select * from public.recurring_rules
    where active and start_date <= today and (end_date is null or end_date >= today)
  loop
    begin
      if public.generate_recurring_occurrence(r, today) then
        v_vars := jsonb_build_object(
          'group_name', coalesce((select name from public.groups where id = r.group_id), '가계부'),
          'content', coalesce(nullif(r.content, ''), nullif(r.category_name, ''), '반복 항목'),
          'amount', to_char(r.amount, 'FM999,999,999,990')
        );
        v_link := case when r.group_id is not null and r.target in ('subscription_payment', 'subscription_deposit')
                       then '/groups/' || r.group_id else '/' end;
        if r.target = 'subscription_deposit' then
          select owner_id into v_owner from public.groups where id = r.group_id;
          select user_id into v_member from public.group_members where id = r.member_id;
          perform public.notify_recurring_generated(v_owner, v_vars, v_link);
          if v_member is not null and v_member is distinct from v_owner then
            perform public.notify_recurring_generated(v_member, v_vars, v_link);
          end if;
        else
          perform public.notify_recurring_generated(r.user_id, v_vars, v_link);
        end if;
      end if;
    exception when others then
      raise warning 'recurring rule % failed: %', r.id, sqlerrm;
    end;
    update public.recurring_rules set last_run_date = today where id = r.id;
  end loop;
end;
$$;
