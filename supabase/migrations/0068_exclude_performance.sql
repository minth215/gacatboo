-- =====================================================================
-- 0068: 카드 실적 포함/제외
--   · 기록 폼에서 원천이 "신용카드"·"체크카드" 원천 그룹일 때 "실적 제외"를 고를 수 있다.
--     transactions.exclude_performance = true 면 통계(원천별)의 카드 실적 합계에서 빠진다.
--   · 그룹 결제(subscription_payments)·입금(subscription_deposits, 멤버 지출 쪽)에도 같은 칸을 두고
--     개인 가계부 미러 거래로 동기화.
-- 0001~0067 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists exclude_performance boolean not null default false;
alter table public.subscription_payments add column if not exists exclude_performance boolean not null default false;
alter table public.subscription_deposits add column if not exists exclude_performance boolean not null default false;

create or replace function public.sync_payment_tx()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = NEW.category_name, category_emoji = NEW.category_emoji,
      source_id = NEW.source_id, source_name = NEW.source_name,
      content = NEW.content, memo = NEW.memo,
      items = NEW.items,
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate,
      exclude_performance = coalesce(NEW.exclude_performance, false)
    where id = NEW.tx_id;
  end if;
  return NEW;
end;
$$;

create or replace function public.sync_deposit_txs()
returns trigger language plpgsql security definer set search_path = public as $sync_dep$
declare v_nick text; v_lcat text; v_lemoji text;
begin
  select coalesce(nullif(nickname,''), '멤버') into v_nick from public.group_members where id = NEW.member_id;
  if coalesce(NEW.leader_category_name,'') = '' then
    select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'') into v_lcat, v_lemoji from public.subscriptions where group_id = NEW.group_id;
  else
    v_lcat := NEW.leader_category_name; v_lemoji := coalesce(NEW.leader_category_emoji,'');
  end if;

  if NEW.leader_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = coalesce(v_lcat,''), category_emoji = coalesce(v_lemoji,''),
      source_name = NEW.deposit_source_name,
      content = coalesce(NEW.content,'') || ' - ' || v_nick, memo = NEW.memo,
      settlement_target_id = NEW.leader_settlement_target_id,
      items = NEW.items,
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate
    where id = NEW.leader_tx_id;
  end if;

  if NEW.member_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = NEW.category_name, category_emoji = NEW.category_emoji, source_name = NEW.source_name,
      content = NEW.content, memo = NEW.memo,
      items = NEW.items,
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate,
      exclude_performance = coalesce(NEW.exclude_performance, false)
    where id = NEW.member_tx_id;
  end if;
  return NEW;
end;
$sync_dep$;
