-- =====================================================================
-- 0004: 구독 결제/입금 ↔ 개인 가계부 양방향 동기화
--   · 원본(subscription_payments/deposits)이 바뀌면 트리거가 미러 tx 갱신
--   · 가계부의 미러 항목은 origin_* 로 원본을 가리켜 편집기로 연결
-- 0001~0003 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 1) 미러 tx → 원본 링크 컬럼
alter table public.transactions add column if not exists origin_type     text;    -- 'payment' | 'deposit'
alter table public.transactions add column if not exists origin_id       bigint;
alter table public.transactions add column if not exists origin_group_id bigint;

-- 기존 미러 tx 백필
update public.transactions t set origin_type = 'payment', origin_id = p.id, origin_group_id = p.group_id
from public.subscription_payments p where t.id = p.tx_id and t.origin_type is null;

update public.transactions t set origin_type = 'deposit', origin_id = d.id, origin_group_id = d.group_id
from public.subscription_deposits d
where (t.id = d.leader_tx_id or t.id = d.member_tx_id) and t.origin_type is null;

-- 2) 입금 내역 UPDATE 권한 (총대 또는 본인 멤버) — 트리거가 미러를 동기화
drop policy if exists subdep_update on public.subscription_deposits;
create policy subdep_update on public.subscription_deposits for update to authenticated
  using (
    public.is_group_owner(group_id, auth.uid())
    or exists (select 1 from public.group_members gm where gm.id = member_id and gm.user_id = auth.uid())
  )
  with check (
    public.is_group_owner(group_id, auth.uid())
    or exists (select 1 from public.group_members gm where gm.id = member_id and gm.user_id = auth.uid())
  );

-- 3) 동기화 트리거: 결제 원본 → 총대 지출 미러
create or replace function public.sync_payment_tx()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = NEW.category_name, category_emoji = NEW.category_emoji,
      source_id = NEW.source_id, source_name = NEW.source_name,
      content = NEW.content, memo = NEW.memo
    where id = NEW.tx_id;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_sync_payment_tx on public.subscription_payments;
create trigger trg_sync_payment_tx after update on public.subscription_payments
  for each row execute function public.sync_payment_tx();

-- 4) 동기화 트리거: 입금 원본 → 총대 수입 미러 + 멤버 지출 미러
create or replace function public.sync_deposit_txs()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nick  text;
  v_cat   text;
  v_emoji text;
begin
  select coalesce(nullif(nickname,''), '멤버') into v_nick from public.group_members where id = NEW.member_id;
  select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'')
  into v_cat, v_emoji from public.subscriptions where group_id = NEW.group_id;

  if NEW.leader_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = coalesce(v_cat,''), category_emoji = coalesce(v_emoji,''),
      source_name = NEW.deposit_source_name,
      content = coalesce(NEW.content,'') || ' - ' || v_nick, memo = NEW.memo
    where id = NEW.leader_tx_id;
  end if;

  if NEW.member_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = NEW.category_name, category_emoji = NEW.category_emoji,
      source_name = NEW.source_name,
      content = NEW.content, memo = NEW.memo
    where id = NEW.member_tx_id;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_sync_deposit_txs on public.subscription_deposits;
create trigger trg_sync_deposit_txs after update on public.subscription_deposits
  for each row execute function public.sync_deposit_txs();

-- 5) 입금 생성 RPC 갱신: 미러 tx 에 origin_* 세팅 추가
create or replace function public.create_subscription_deposit(
  p_group_id bigint,
  p_member_id bigint,
  p_date date,
  p_amount bigint,
  p_periods int,
  p_category_name text,
  p_category_emoji text,
  p_source_id bigint,
  p_source_name text,
  p_deposit_source_name text,
  p_content text,
  p_memo text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_owner      uuid;
  v_member_uid uuid;
  v_nickname   text;
  v_dep_cat    text;
  v_dep_emoji  text;
  v_leader_tx  bigint;
  v_member_tx  bigint;
  v_dep_id     bigint;
begin
  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner is null then raise exception '그룹을 찾을 수 없습니다.'; end if;

  select user_id, coalesce(nullif(nickname,''), '멤버') into v_member_uid, v_nickname
  from public.group_members where id = p_member_id and group_id = p_group_id;
  if not found then raise exception '멤버를 찾을 수 없습니다.'; end if;

  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '입금을 입력할 권한이 없습니다.';
  end if;

  select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'')
  into v_dep_cat, v_dep_emoji from public.subscriptions where group_id = p_group_id;

  insert into public.transactions(user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by)
  values (v_owner, null, 'income', p_date, p_amount, coalesce(v_dep_cat,''), coalesce(v_dep_emoji,''),
          coalesce(p_deposit_source_name,''), coalesce(p_content,'') || ' - ' || v_nickname, coalesce(p_memo,''), v_uid)
  returning id into v_leader_tx;

  if v_member_uid is not null then
    insert into public.transactions(user_id, group_id, type, date, amount, category_id, category_name, category_emoji, source_id, source_name, content, memo, created_by)
    values (v_member_uid, null, 'expense', p_date, p_amount, null, coalesce(p_category_name,''), coalesce(p_category_emoji,''),
            p_source_id, coalesce(p_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_uid)
    returning id into v_member_tx;
  end if;

  insert into public.subscription_deposits(
    group_id, member_id, date, amount, periods, category_name, category_emoji,
    source_id, source_name, deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by)
  values (p_group_id, p_member_id, p_date, p_amount, greatest(coalesce(p_periods,1),1),
          coalesce(p_category_name,''), coalesce(p_category_emoji,''), p_source_id, coalesce(p_source_name,''),
          coalesce(p_deposit_source_name,''), coalesce(p_content,''), coalesce(p_memo,''),
          v_leader_tx, v_member_tx, v_uid)
  returning id into v_dep_id;

  update public.transactions set origin_type = 'deposit', origin_id = v_dep_id, origin_group_id = p_group_id
  where id = v_leader_tx or id = v_member_tx;

  return v_dep_id;
end;
$$;
