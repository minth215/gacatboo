-- =====================================================================
-- 0088: 금액 직접 수정 이전 날짜의 온누리 결제도 통계에서는 디지털 온누리로
--   · 원천 관리에서 디지털 온누리 금액을 직접 수정한 뒤 그 이전 날짜의 온누리 가맹점 결제를 입력하면,
--     원천 금액은 바뀌지 않지만(이미 반영됐다고 봄) 원천별 통계에서는 전액 디지털 온누리 결제로 잡는다.
--   · my_source_balances 는 기준 날짜 이전 기록을 제외하므로 원천 금액에는 영향 없음.
-- 0001~0087 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

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
    -- 원천 관리에서 금액을 직접 수정한 날짜 이전의 온누리 결제: 수정한 금액에 이미 차감이 들어 있다고 보고
    -- 잔액 계산에서는 빼되(my_source_balances 의 날짜 조건), 통계용으로는 전액 디지털 온누리 결제로 본다.
    if s.from_date is not null then
      return query
        select t.id, s.id, t.amount from public.transactions t
        where t.user_id = v_uid and t.onnuri and t.type = 'expense' and t.onnuri_source_id = s.id and t.date < s.from_date;
    end if;
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
