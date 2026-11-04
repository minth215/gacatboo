-- =====================================================================
-- 0087: 온누리 가맹점 차감을 "차감 시점 잔액" 기준으로 + 공금 그룹 적용
--   · 차감액을 저장 시점에 고정하지 않고, 디지털 온누리 원천의 기록을 날짜순(같은 날은 입력순)으로 따라가며
--     그 시점 잔액만큼만 차감한다(my_onnuri_deductions). 미래 날짜 기록은 그 날짜가 되면 차감.
--     transactions.onnuri_amount 는 더 이상 쓰지 않는다.
--   · my_source_balances 는 위 차감액을 반영.
--   · 공금 그룹 사용 내역: pooled_fund_expenses.onnuri 저장 + 참여 멤버 미러 지출에 온누리 가맹점 표시
--     (각 멤버의 디지털 온누리 원천 기준). 미러 지출 원천은 세부 항목 이름으로 찾도록 수정(0083 이후 그룹 선택 불가).
-- 0001~0086 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

-- 내 온누리 가맹점 지출별 디지털 온누리 차감액
create or replace function public.my_onnuri_deductions()
returns table (tx_id bigint, source_id bigint, amount bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  s record;
  e record;
  bal bigint;
  d bigint;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_uid uuid := auth.uid();
begin
  for s in
    select src.id, coalesce(src.balance, 0) as base,
           case when src.balance_set_at is null then null else (src.balance_set_at at time zone 'Asia/Seoul')::date end as from_date
    from public.sources src
    where src.user_id = v_uid
      and exists (select 1 from public.transactions t where t.user_id = v_uid and t.onnuri and t.onnuri_source_id = src.id)
  loop
    bal := s.base;
    for e in
      select t.id, t.type, t.amount, t.source_id, t.to_source_id,
             (t.onnuri and t.type = 'expense' and t.onnuri_source_id = s.id) as is_onnuri
      from public.transactions t
      where t.user_id = v_uid and t.date <= v_today and (s.from_date is null or t.date >= s.from_date)
        and (t.source_id = s.id or t.to_source_id = s.id or (t.onnuri and t.onnuri_source_id = s.id))
      order by t.date, t.id
    loop
      if e.is_onnuri then
        d := greatest(0, least(bal, e.amount));
        tx_id := e.id; source_id := s.id; amount := d;
        return next;
        bal := bal - d;
      elsif e.type = 'income' and e.source_id = s.id then
        bal := bal + e.amount;
      elsif e.type = 'expense' and e.source_id = s.id then
        bal := bal - e.amount;
      elsif e.type = 'transfer' then
        if e.source_id = s.id then bal := bal - e.amount; end if;
        if e.to_source_id = s.id then bal := bal + e.amount; end if;
      end if;
    end loop;
  end loop;
end;
$$;
grant execute on function public.my_onnuri_deductions() to authenticated;

create or replace function public.my_source_balances()
returns table (source_id bigint, current_balance bigint)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date as d),
  mine as (
    select s.id, coalesce(s.balance, 0) as base,
           case when s.balance_set_at is null then null else (s.balance_set_at at time zone 'Asia/Seoul')::date end as from_date
    from public.sources s
    where s.user_id = auth.uid()
      and coalesce((select p.group_type from public.sources p where p.id = s.parent_id), s.group_type) not in ('credit', 'check')
  ),
  eff as (
    select t.source_id as sid, t.date,
           case t.type when 'income' then t.amount else -t.amount end as delta
    from public.transactions t where t.user_id = auth.uid() and t.source_id is not null and t.type in ('income', 'expense', 'transfer')
    union all
    select t.to_source_id, t.date, t.amount
    from public.transactions t where t.user_id = auth.uid() and t.to_source_id is not null and t.type = 'transfer'
    union all
    -- 온누리 가맹점 결제: 차감 시점 잔액 기준 차감액(이미 날짜 조건을 적용해 계산됨)
    select d.source_id, t.date, -d.amount
    from public.my_onnuri_deductions() d join public.transactions t on t.id = d.tx_id
  )
  select m.id, (m.base + coalesce(sum(e.delta) filter (
           where e.date <= (select d from today) and (m.from_date is null or e.date >= m.from_date)
         ), 0))::bigint
  from mine m left join eff e on e.sid = m.id
  group by m.id, m.base;
$$;
grant execute on function public.my_source_balances() to authenticated;

-- ---------- 공금 그룹 ----------
alter table public.pooled_fund_expenses add column if not exists onnuri boolean not null default false;

-- 멤버의 원천 찾기(이름): 세부 항목 우선, 없으면 같은 이름 그룹의 첫 세부 항목, 그것도 없으면 그룹
create or replace function public.member_source_by_name(p_uid uuid, p_name text)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.id from public.sources c where c.user_id = p_uid and c.parent_id is not null and c.name = p_name order by c.sort_order, c.id limit 1),
    (select c.id from public.sources g join public.sources c on c.parent_id = g.id
      where g.user_id = p_uid and g.parent_id is null and g.name = p_name order by c.sort_order, c.id limit 1),
    (select g.id from public.sources g where g.user_id = p_uid and g.parent_id is null and g.name = p_name limit 1)
  );
$$;

-- 사용 내역의 온누리 가맹점 여부 저장 + 참여 멤버 미러 지출에 반영(멤버별 디지털 온누리 원천)
create or replace function public.set_pooled_expense_onnuri(p_id bigint, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_group_id bigint;
begin
  select group_id into v_group_id from public.pooled_fund_expenses where id = p_id;
  if v_group_id is null then raise exception '사용 내역을 찾을 수 없습니다.'; end if;
  if not public.is_group_member(v_group_id, auth.uid()) then raise exception '권한이 없습니다.'; end if;

  update public.pooled_fund_expenses set onnuri = coalesce(p_on, false) where id = p_id;
  update public.transactions t
  set onnuri = coalesce(p_on, false),
      onnuri_source_id = case when coalesce(p_on, false) then (
        select c.id from public.sources g join public.sources c on c.parent_id = g.id
        where g.user_id = t.user_id and g.parent_id is null and g.group_type = 'onnuri'
        order by g.sort_order, g.id, c.sort_order, c.id limit 1
      ) else null end,
      onnuri_amount = null
  where t.id in (select m.transaction_id from public.pooled_fund_expense_members m where m.expense_id = p_id and m.transaction_id is not null);
end;
$$;
grant execute on function public.set_pooled_expense_onnuri(bigint, boolean) to authenticated;

create or replace function public.create_pooled_fund_expense(
  p_group_id bigint, p_date date, p_amount bigint, p_content text, p_memo text,
  p_items jsonb, p_splits jsonb, p_source_name text default ''
) returns bigint
language plpgsql security definer set search_path = public as $cpfe$
declare
  v_uid uuid := auth.uid();
  v_expense_id bigint;
  v_split jsonb;
  v_member_uid uuid;
  v_tx bigint;
  v_source_id bigint;
begin
  if not public.is_group_member(p_group_id, v_uid) then
    raise exception '권한이 없습니다.';
  end if;

  insert into public.pooled_fund_expenses(group_id, date, amount, content, memo, items, created_by)
  values (p_group_id, p_date, p_amount, coalesce(p_content,''), coalesce(p_memo,''), p_items, v_uid)
  returning id into v_expense_id;

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    select user_id into v_member_uid from public.group_members
      where id = (v_split->>'member_id')::bigint and group_id = p_group_id;
    v_tx := null;
    if v_member_uid is not null then
      v_source_id := null;
      if coalesce(p_source_name,'') <> '' then
        v_source_id := public.member_source_by_name(v_member_uid, p_source_name);
      end if;
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, source_id, source_name, content, memo, created_by, origin_type, origin_group_id)
      values (v_member_uid, null, 'expense', p_date, (v_split->>'amount')::bigint, '공금', v_source_id, coalesce(p_source_name,''), coalesce(p_content,''), '', v_uid, 'pooled_fund_expense', p_group_id)
      returning id into v_tx;
    end if;
    insert into public.pooled_fund_expense_members(expense_id, member_id, amount, transaction_id)
    values (v_expense_id, (v_split->>'member_id')::bigint, (v_split->>'amount')::bigint, v_tx);
  end loop;

  return v_expense_id;
end;
$cpfe$;
grant execute on function public.create_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb, text) to authenticated;

create or replace function public.update_pooled_fund_expense(
  p_id bigint, p_date date, p_amount bigint, p_content text, p_memo text,
  p_items jsonb, p_splits jsonb, p_source_name text default ''
) returns void
language plpgsql security definer set search_path = public as $upfe$
declare
  v_uid uuid := auth.uid();
  v_group_id bigint;
  v_split jsonb;
  v_member_uid uuid;
  v_tx bigint;
  v_source_id bigint;
begin
  select group_id into v_group_id from public.pooled_fund_expenses where id = p_id;
  if v_group_id is null then raise exception '사용 내역을 찾을 수 없습니다.'; end if;
  if not public.is_group_member(v_group_id, v_uid) then raise exception '권한이 없습니다.'; end if;

  delete from public.transactions where id in (
    select transaction_id from public.pooled_fund_expense_members where expense_id = p_id and transaction_id is not null
  );
  delete from public.pooled_fund_expense_members where expense_id = p_id;

  update public.pooled_fund_expenses
    set date = p_date, amount = p_amount, content = coalesce(p_content,''), memo = coalesce(p_memo,''), items = p_items
    where id = p_id;

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    select user_id into v_member_uid from public.group_members
      where id = (v_split->>'member_id')::bigint and group_id = v_group_id;
    v_tx := null;
    if v_member_uid is not null then
      v_source_id := null;
      if coalesce(p_source_name,'') <> '' then
        v_source_id := public.member_source_by_name(v_member_uid, p_source_name);
      end if;
      insert into public.transactions(user_id, group_id, type, date, amount, category_name, source_id, source_name, content, memo, created_by, origin_type, origin_group_id)
      values (v_member_uid, null, 'expense', p_date, (v_split->>'amount')::bigint, '공금', v_source_id, coalesce(p_source_name,''), coalesce(p_content,''), '', v_uid, 'pooled_fund_expense', v_group_id)
      returning id into v_tx;
    end if;
    insert into public.pooled_fund_expense_members(expense_id, member_id, amount, transaction_id)
    values (p_id, (v_split->>'member_id')::bigint, (v_split->>'amount')::bigint, v_tx);
  end loop;
end;
$upfe$;
grant execute on function public.update_pooled_fund_expense(bigint, date, bigint, text, text, jsonb, jsonb, text) to authenticated;
