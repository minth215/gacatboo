-- =====================================================================
-- 0116: 반복 등록한 이체의 입금 금액(to_amount) 자동 채우기
--   · 반복으로 자동 기록되는 이체(recurring_id 있음)에 입금 금액이 비어 있으면
--     입금 수단의 금액 화폐(sources.balance_currency, 없으면 KRW)를 to_currency 로 두고
--       - 출금 화폐와 같으면 출금 금액 그대로
--       - 입금 화폐가 원화면 원화 환산 금액(amount)
--       - 그 밖(서로 다른 보조 화폐 등)은 비워 두고, 그날 자동 기록 뒤 recurring-fx 가 실시간 환율로 채운다.
--   · 자동 기록 후 화폐가 다른 반복 이체가 있으면 recurring-fx 를 호출(기존 보조 화폐 항목 조건에 추가).
--   ⚠️ Edge Function 다시 배포 필요: supabase functions deploy recurring-fx
-- 0115 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.fill_recurring_transfer_to_amount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_from text := coalesce(nullif(new.input_currency, ''), 'KRW');
  v_to text;
begin
  if new.type <> 'transfer' or new.recurring_id is null or new.to_amount is not null or new.to_source_id is null then
    return new;
  end if;
  select coalesce(nullif(balance_currency, ''), 'KRW') into v_to from public.sources where id = new.to_source_id;
  v_to := coalesce(v_to, 'KRW');
  new.to_currency := v_to;
  if v_to = v_from then
    new.to_amount := case when v_from = 'KRW' then new.amount else coalesce(new.input_amount, new.amount) end;
  elsif v_to = 'KRW' then
    new.to_amount := new.amount;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_recurring_transfer_to_amount on public.transactions;
create trigger trg_fill_recurring_transfer_to_amount
  before insert on public.transactions
  for each row execute function public.fill_recurring_transfer_to_amount();

-- 0071 과 같고, recurring-fx 호출 조건에 "오늘 자동 기록된 화폐가 다른 이체"를 추가
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
          'amount', case when coalesce(r.input_currency, '') <> '' and r.input_amount is not null
                         then trim(to_char(r.input_amount, 'FM999,999,999,990.##'), '.') || ' ' || r.input_currency
                         else to_char(r.amount, 'FM999,999,999,990') end
        );
        if coalesce(r.input_currency, '') <> '' then v_fx_count := v_fx_count + 1; end if;
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

  -- 화폐가 다른 반복 이체(입금 금액을 환율로 채워야 함)
  if exists (
    select 1 from public.transactions
    where date = today and recurring_id is not null and type = 'transfer'
      and to_currency is not null and to_currency <> coalesce(nullif(input_currency, ''), 'KRW')
  ) then
    v_fx_count := v_fx_count + 1;
  end if;

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
