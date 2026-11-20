-- =====================================================================
-- 0120: 구독 그룹 반복 결제/입금이 자동 등록될 때 "내용/수량/금액" 표(items)도 함께 기록
--   · 반복 규칙(recurring_rules.items)에는 항목이 있지만, 그룹 결제(subscription_payments)·입금
--     (subscription_deposits)과 가계부 미러 기록에는 항목 없이 등록되던 문제.
--   · 그 테이블에 반복으로 들어오는 행(recurring_id 있음, items 비어 있음)에 규칙의 항목을 채우고,
--     연결된 가계부 기록(결제: tx_id, 입금: leader_tx_id·member_tx_id)에도 같은 항목을 넣는다.
--   · 선입금 차감 등으로 금액이 규칙과 다르면: 항목이 하나면 그 금액으로 맞추고, 여러 개면 마지막 항목에서 차이를 조정.
-- 0119 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.recurring_items_for_amount(p_items jsonb, p_amount numeric, p_input_amount numeric)
returns jsonb language plpgsql immutable as $$
declare
  v_total numeric := 0;
  v_n int;
  v_last jsonb;
  v_diff numeric;
  e jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then return null; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    -- 구독 그룹 표의 둘째 칸은 회차(금액에 곱하지 않음)
    v_total := v_total + coalesce((e->>'amount')::numeric, 0);
  end loop;
  if p_amount is null or v_total = p_amount then return p_items; end if;
  v_n := jsonb_array_length(p_items);
  v_last := p_items -> (v_n - 1);
  v_diff := p_amount - v_total;
  v_last := jsonb_set(v_last, '{amount}', to_jsonb(round(coalesce((v_last->>'amount')::numeric, 0) + v_diff)));
  -- 항목이 하나뿐이고 보조 화폐면 화폐 금액도 이번 회차 금액으로
  if v_n = 1 and coalesce(v_last->>'input_currency', '') <> '' and p_input_amount is not null then
    v_last := jsonb_set(v_last, '{input_amount}', to_jsonb(p_input_amount));
  end if;
  return jsonb_set(p_items, array[(v_n - 1)::text], v_last);
end;
$$;

create or replace function public.trg_recurring_group_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
begin
  if new.recurring_id is null or new.items is not null then return new; end if;
  select items into v_items from public.recurring_rules where id = new.recurring_id;
  new.items := public.recurring_items_for_amount(v_items, new.amount, new.input_amount);
  return new;
end;
$$;

create or replace function public.trg_recurring_group_items_mirror()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recurring_id is null or new.items is null then return new; end if;
  if tg_table_name = 'subscription_payments' then
    update public.transactions set items = new.items where id = new.tx_id and items is null;
  else
    update public.transactions set items = new.items where id in (new.leader_tx_id, new.member_tx_id) and items is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recurring_group_items on public.subscription_payments;
create trigger trg_recurring_group_items before insert on public.subscription_payments
  for each row execute function public.trg_recurring_group_items();
drop trigger if exists trg_recurring_group_items_mirror on public.subscription_payments;
create trigger trg_recurring_group_items_mirror after insert on public.subscription_payments
  for each row execute function public.trg_recurring_group_items_mirror();

drop trigger if exists trg_recurring_group_items on public.subscription_deposits;
create trigger trg_recurring_group_items before insert on public.subscription_deposits
  for each row execute function public.trg_recurring_group_items();
drop trigger if exists trg_recurring_group_items_mirror on public.subscription_deposits;
create trigger trg_recurring_group_items_mirror after insert on public.subscription_deposits
  for each row execute function public.trg_recurring_group_items_mirror();

-- 이미 항목 없이 자동 등록된 반복 결제/입금(과 가계부 미러)에도 규칙의 항목을 채움
update public.subscription_payments p
   set items = public.recurring_items_for_amount(r.items, p.amount, p.input_amount)
  from public.recurring_rules r
 where p.recurring_id = r.id and p.items is null and r.items is not null;
update public.subscription_deposits d
   set items = public.recurring_items_for_amount(r.items, d.amount, d.input_amount)
  from public.recurring_rules r
 where d.recurring_id = r.id and d.items is null and r.items is not null;
update public.transactions t set items = p.items
  from public.subscription_payments p
 where p.recurring_id is not null and p.items is not null and t.id = p.tx_id and t.items is null;
update public.transactions t set items = d.items
  from public.subscription_deposits d
 where d.recurring_id is not null and d.items is not null and t.id in (d.leader_tx_id, d.member_tx_id) and t.items is null;
