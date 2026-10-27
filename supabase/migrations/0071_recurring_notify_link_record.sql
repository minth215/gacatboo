-- =====================================================================
-- 0071: 반복 항목 알림을 누르면 그날 등록된 기록의 "기록 수정" 화면으로 이동
--   · 알림 링크(notifications.link)를 가계부(/)·그룹 페이지 대신 등록된 기록으로 지정.
--     일반 기록 → /tx/<id>, 그룹 결제 → /tx/<id>?group=<gid>&kind=payment,
--     그룹 입금 → /tx/<id>?group=<gid>&kind=deposit (기록을 못 찾으면 예전 링크 그대로)
--   · 이 마이그레이션 이후 새로 오는 알림부터 적용(이미 받은 알림의 링크는 그대로).
-- 0001~0070 이후 실행. 여러 번 실행해도 안전.
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
  v_rec bigint;
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
        -- 알림을 누르면 이번에 등록된 기록의 수정 화면으로(못 찾으면 예전처럼 가계부/그룹으로)
        v_rec := null;
        if r.target = 'subscription_payment' then
          select id into v_rec from public.subscription_payments
            where recurring_id = r.id and date = today order by id desc limit 1;
          v_link := case when v_rec is not null then '/tx/' || v_rec || '?group=' || r.group_id || '&kind=payment'
                         else '/groups/' || r.group_id end;
        elsif r.target = 'subscription_deposit' then
          select id into v_rec from public.subscription_deposits
            where recurring_id = r.id and date = today order by id desc limit 1;
          v_link := case when v_rec is not null then '/tx/' || v_rec || '?group=' || r.group_id || '&kind=deposit'
                         else '/groups/' || r.group_id end;
        else
          select id into v_rec from public.transactions
            where recurring_id = r.id and date = today order by id desc limit 1;
          v_link := case when v_rec is not null then '/tx/' || v_rec else '/' end;
        end if;
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
