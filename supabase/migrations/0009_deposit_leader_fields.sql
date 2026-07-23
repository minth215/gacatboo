-- =====================================================================
-- 0009: 입금 내역에 '총대 가계부' 분류/정산대상 분리 저장
--   · 멤버 지출: category_name/emoji, source_name (기존)
--   · 총대 수입: leader_category_name/emoji, deposit_source_name(원천), leader_settlement_target_id(정산 대상)
-- 0001~0008 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.subscription_deposits add column if not exists leader_category_name        text   not null default '';
alter table public.subscription_deposits add column if not exists leader_category_emoji       text   not null default '';
alter table public.subscription_deposits add column if not exists leader_settlement_target_id bigint references public.transactions(id) on delete set null;

-- 기존 입금 건의 총대 분류를 구독 설정의 입금분류로 백필
update public.subscription_deposits d
  set leader_category_name  = coalesce(s.deposit_category, ''),
      leader_category_emoji = coalesce(s.deposit_category_emoji, '')
  from public.subscriptions s
  where s.group_id = d.group_id and coalesce(d.leader_category_name, '') = '';

-- ---------- 입금 생성 RPC (파라미터 확장) ----------
drop function if exists public.create_subscription_deposit(bigint,bigint,date,bigint,int,text,text,bigint,text,text,text,text);

create or replace function public.create_subscription_deposit(
  p_group_id bigint, p_member_id bigint, p_date date, p_amount bigint, p_periods int,
  p_category_name text, p_category_emoji text, p_source_id bigint, p_source_name text,
  p_deposit_source_name text, p_content text, p_memo text,
  p_leader_category_name text, p_leader_category_emoji text, p_leader_settlement_target_id bigint
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid; v_member_uid uuid; v_nickname text;
  v_lcat text; v_lemoji text;
  v_leader_tx bigint; v_member_tx bigint; v_dep_id bigint;
begin
  select owner_id into v_owner from public.groups where id = p_group_id;
  if v_owner is null then raise exception '그룹을 찾을 수 없습니다.'; end if;

  select user_id, coalesce(nullif(nickname,''), '멤버') into v_member_uid, v_nickname
    from public.group_members where id = p_member_id and group_id = p_group_id;
  if not found then raise exception '멤버를 찾을 수 없습니다.'; end if;

  if v_uid <> v_owner and (v_member_uid is null or v_uid <> v_member_uid) then
    raise exception '입금을 입력할 권한이 없습니다.';
  end if;

  -- 총대 분류: 미지정 시 구독 설정의 입금분류
  if coalesce(p_leader_category_name,'') = '' then
    select coalesce(deposit_category,''), coalesce(deposit_category_emoji,'')
      into v_lcat, v_lemoji from public.subscriptions where group_id = p_group_id;
  else
    v_lcat := p_leader_category_name; v_lemoji := coalesce(p_leader_category_emoji,'');
  end if;

  -- 총대 수입 tx
  insert into public.transactions(user_id, group_id, type, date, amount, category_name, category_emoji, source_name, content, memo, created_by, settlement_target_id)
  values (v_owner, null, 'income', p_date, p_amount, coalesce(v_lcat,''), coalesce(v_lemoji,''),
          coalesce(p_deposit_source_name,''), coalesce(p_content,'') || ' - ' || v_nickname, coalesce(p_memo,''), v_uid, p_leader_settlement_target_id)
  returning id into v_leader_tx;

  -- 멤버 지출 tx (계정 멤버만)
  if v_member_uid is not null then
    insert into public.transactions(user_id, group_id, type, date, amount, category_id, category_name, category_emoji, source_id, source_name, content, memo, created_by)
    values (v_member_uid, null, 'expense', p_date, p_amount, null, coalesce(p_category_name,''), coalesce(p_category_emoji,''),
            null, coalesce(p_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_uid)
    returning id into v_member_tx;
  end if;

  insert into public.subscription_deposits(
    group_id, member_id, date, amount, periods, category_name, category_emoji, source_id, source_name,
    deposit_source_name, content, memo, leader_tx_id, member_tx_id, created_by,
    leader_category_name, leader_category_emoji, leader_settlement_target_id)
  values (p_group_id, p_member_id, p_date, p_amount, greatest(coalesce(p_periods,1),1),
    coalesce(p_category_name,''), coalesce(p_category_emoji,''), null, coalesce(p_source_name,''),
    coalesce(p_deposit_source_name,''), coalesce(p_content,''), coalesce(p_memo,''), v_leader_tx, v_member_tx, v_uid,
    coalesce(v_lcat,''), coalesce(v_lemoji,''), p_leader_settlement_target_id)
  returning id into v_dep_id;

  update public.transactions set origin_type='deposit', origin_id=v_dep_id, origin_group_id=p_group_id
    where id = v_leader_tx or id = v_member_tx;
  return v_dep_id;
end;
$$;

grant execute on function public.create_subscription_deposit(bigint,bigint,date,bigint,int,text,text,bigint,text,text,text,text,text,text,bigint) to authenticated;

-- ---------- 동기화 트리거: 총대 분류/정산대상 반영 ----------
create or replace function public.sync_deposit_txs()
returns trigger language plpgsql security definer set search_path = public as $$
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
      settlement_target_id = NEW.leader_settlement_target_id
    where id = NEW.leader_tx_id;
  end if;

  if NEW.member_tx_id is not null then
    update public.transactions set
      date = NEW.date, amount = NEW.amount,
      category_name = NEW.category_name, category_emoji = NEW.category_emoji, source_name = NEW.source_name,
      content = NEW.content, memo = NEW.memo
    where id = NEW.member_tx_id;
  end if;
  return NEW;
end;
$$;
