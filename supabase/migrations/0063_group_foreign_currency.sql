-- =====================================================================
-- 0063: 그룹 기록도 보조 화폐 입력을 개인 가계부와 똑같이 저장/복원
--   · 개인 기록(transactions)은 input_currency/input_amount/fx_rate(+ 항목별 items[].input_currency…)로
--     보조 화폐 입력을 보관해 수정 화면에서 "12.5 USD / 17,250 KRW"로 되살린다(0021, 앱 쪽 항목별 저장).
--   · 그룹 결제(subscription_payments)·입금(subscription_deposits)·공금 이체(pooled_fund_transfers)에도
--     같은 칸을 추가하고, 개인 가계부에 미러링된 거래(transactions)에도 그대로 반영해 가계부 카드에서도
--     보조 화폐 금액이 보이게 한다. 결제는 항목(items)도 함께 저장(개인 기록과 동일하게 항목 행 복원).
--   · 공금 사용 내역(pooled_fund_expenses)은 이미 items 를 저장하므로 항목별 화폐 정보로 복원됨(변경 없음).
-- 0001~0062 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.subscription_payments add column if not exists items jsonb;
alter table public.subscription_payments add column if not exists input_currency text not null default '';
alter table public.subscription_payments add column if not exists input_amount numeric;
alter table public.subscription_payments add column if not exists fx_rate numeric;

alter table public.subscription_deposits add column if not exists input_currency text not null default '';
alter table public.subscription_deposits add column if not exists input_amount numeric;
alter table public.subscription_deposits add column if not exists fx_rate numeric;

alter table public.pooled_fund_transfers add column if not exists input_currency text not null default '';
alter table public.pooled_fund_transfers add column if not exists input_amount numeric;
alter table public.pooled_fund_transfers add column if not exists fx_rate numeric;

-- 결제 수정 → 미러 거래 동기화(0004 버전 + items/보조 화폐)
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
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate
    where id = NEW.tx_id;
  end if;
  return NEW;
end;
$$;

-- 입금 수정 → 총대/멤버 미러 거래 동기화(0054 버전 + 보조 화폐)
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
      input_currency = coalesce(NEW.input_currency, ''), input_amount = NEW.input_amount, fx_rate = NEW.fx_rate
    where id = NEW.member_tx_id;
  end if;
  return NEW;
end;
$sync_dep$;

-- 공금 이체의 보조 화폐 정보 저장(생성/수정 RPC 뒤에 이어서 호출). 이체를 입력할 수 있는 사람
-- (총무 또는 그 멤버 본인)만 가능하고, 멤버 개인 가계부에 미러링된 이체 거래에도 함께 반영한다.
create or replace function public.set_pooled_fund_transfer_currency(
  p_id bigint, p_input_currency text, p_input_amount numeric, p_fx_rate numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint; v_member_id bigint; v_tx bigint; v_owner uuid; v_member_uid uuid;
begin
  select group_id, member_id, member_tx_id into v_group_id, v_member_id, v_tx from public.pooled_fund_transfers where id = p_id;
  if not found then raise exception '이체 내역을 찾을 수 없습니다.'; end if;
  select owner_id into v_owner from public.groups where id = v_group_id;
  select user_id into v_member_uid from public.group_members where id = v_member_id;
  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '이체 내역을 수정할 권한이 없습니다.';
  end if;

  update public.pooled_fund_transfers set
    input_currency = coalesce(p_input_currency, ''), input_amount = p_input_amount, fx_rate = p_fx_rate
  where id = p_id;
  if v_tx is not null then
    update public.transactions set
      input_currency = coalesce(p_input_currency, ''), input_amount = p_input_amount, fx_rate = p_fx_rate
    where id = v_tx;
  end if;
end;
$$;
grant execute on function public.set_pooled_fund_transfer_currency(bigint, text, numeric, numeric) to authenticated;
