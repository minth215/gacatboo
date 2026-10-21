-- =====================================================================
-- 0065: 보조 화폐 반복 항목의 원화 금액을 "그날의 환율"로 계산
--   · 매일 자동 기록이 끝난 뒤, 오늘 기록된 보조 화폐 반복 항목이 있으면 recurring-fx Edge Function 을
--     호출해 각 항목의 원화 금액을 그날 환율(앱과 같은 Frankfurter)로 다시 계산한다.
--     (그룹 결제/입금은 원본 행을 고쳐 동기화 트리거로 개인 가계부 미러까지 반영)
--   · 알림 문구의 {amount} 는 보조 화폐 항목이면 입력한 보조 화폐 금액(예: 12.5 USD)으로 표시.
--
--   ⚠️ Edge Function 배포 필요: supabase functions deploy recurring-fx
--      (Vault 의 service_role_key 와 함수 주소는 0061 과 같은 값을 사용)
-- 0001~0064 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.generate_due_recurring_transactions()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  r public.recurring_rules;
  v_vars jsonb;
  v_link text;
  v_owner uuid;
  v_member uuid;
  v_fx_count int := 0;
  v_url text;
  v_key text;
begin
  for r in select * from public.recurring_rules
    where active and start_date <= today and (end_date is null or end_date >= today)
  loop
    begin
      if public.generate_recurring_occurrence(r, today) then
        v_vars := jsonb_build_object(
          'group_name', coalesce((select name from public.groups where id = r.group_id), '가계부'),
          'content', coalesce(nullif(r.content, ''), nullif(r.category_name, ''), '반복 항목'),
          -- 보조 화폐 항목은 원화 금액이 곧 그날 환율로 다시 계산되므로 입력한 보조 화폐 금액으로 안내
          'amount', case when coalesce(r.input_currency, '') <> '' and r.input_amount is not null
                         then trim(to_char(r.input_amount, 'FM999,999,999,990.##'), '.') || ' ' || r.input_currency
                         else to_char(r.amount, 'FM999,999,999,990') end
        );
        if coalesce(r.input_currency, '') <> '' then v_fx_count := v_fx_count + 1; end if;
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

  -- 보조 화폐 항목이 기록됐으면 원화 금액을 그날 환율로 다시 계산(recurring-fx Edge Function, 비동기)
  if v_fx_count > 0 then
    begin
      v_url := public._functions_base_url();
      select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
      if v_url is not null and v_key is not null then
        perform net.http_post(
          url := v_url || '/functions/v1/recurring-fx',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object('date', today)
        );
      end if;
    exception when others then
      raise warning 'recurring-fx call failed: %', sqlerrm;
    end;
  end if;
end;
$$;
