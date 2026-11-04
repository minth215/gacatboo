-- =====================================================================
-- 0091: 결제 대금 금액 자동 갱신 + 기록 페이지 "카드" 필드
--   · transactions.card_bill_period_start 추가(청구 기간 시작). 기존 자동 입력 대금은 카드 설정으로 채움.
--   · card_bill_total(uid, card, start, end): 청구 기간 카드 지출 합계 − 온누리 차감액.
--   · 카드 지출 기록을 추가·수정·삭제하면, 그 날짜가 청구 기간에 들어가는 결제 대금 기록 금액을 다시 계산(트리거).
--   · card_bill_amount(card, due): 기록 페이지에서 "카드"를 고르면 납부일 기준 청구 기간·금액을 채우기 위한 RPC.
-- 0001~0090 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists card_bill_period_start date;

update public.transactions t
set card_bill_period_start = public.card_bill_date(t.date, s.bill_start_offset, s.bill_start_day)
from public.sources s
where t.card_bill_source_id = s.id and t.card_bill_period_start is null and s.bill_start_offset is not null;

create or replace function public.card_bill_total(p_uid uuid, p_card bigint, p_start date, p_end date)
returns bigint language sql stable security definer set search_path = public as $$
  select (
    coalesce((select sum(t.amount) from public.transactions t
              where t.user_id = p_uid and t.source_id = p_card and t.type = 'expense' and t.date between p_start and p_end), 0)
    - coalesce((select sum(d.amount) from public.onnuri_deductions_for(p_uid) d join public.transactions t on t.id = d.tx_id
                where t.source_id = p_card and t.type = 'expense' and t.date between p_start and p_end), 0)
  )::bigint;
$$;
revoke execute on function public.card_bill_total(uuid, bigint, date, date) from public, anon, authenticated;

create or replace function public.generate_card_bills(p_uid uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month date;
  v_due date;
  v_start date;
  v_end date;
  v_total bigint;
  v_cat record;
  v_link record;
  v_count int := 0;
  k int;
begin
  for s in
    select c.* from public.sources c join public.sources g on g.id = c.parent_id
    where g.group_type = 'credit' and c.auto_bill and c.linked_source_id is not null and c.payment_day is not null
      and c.bill_start_offset is not null and c.bill_start_day is not null and c.bill_end_offset is not null and c.bill_end_day is not null
      and (p_uid is null or c.user_id = p_uid)
  loop
    select id, name into v_link from public.sources where id = s.linked_source_id;
    select id, emoji, color into v_cat from public.categories where user_id = s.user_id and type = 'expense' and name = '결제 대금' order by id limit 1;
    for k in -1 .. 0 loop
      v_month := (date_trunc('month', v_today) + make_interval(months => k))::date;
      v_due := public.adjust_business_day(public.card_bill_date(v_month, 0, s.payment_day), coalesce(s.payment_business_rule, 'none'));
      continue when v_due > v_today or v_due < coalesce(s.auto_bill_since, v_today);
      v_start := public.card_bill_date(v_month, s.bill_start_offset, s.bill_start_day);
      v_end := public.card_bill_date(v_month, s.bill_end_offset, s.bill_end_day);
      continue when exists (select 1 from public.transactions t where t.card_bill_source_id = s.id and t.card_bill_period_end = v_end);

      v_total := public.card_bill_total(s.user_id, s.id, v_start, v_end);
      continue when v_total <= 0;

      insert into public.transactions(user_id, type, date, amount, category_id, category_name, category_emoji, category_color,
        source_id, source_name, content, memo, created_by, card_bill_source_id, card_bill_period_start, card_bill_period_end)
      values (s.user_id, 'expense', v_due, v_total, v_cat.id, '결제 대금', coalesce(v_cat.emoji, ''), coalesce(v_cat.color, ''),
        v_link.id, coalesce(v_link.name, ''), s.name || ' 결제 대금', '', s.user_id, s.id, v_start, v_end);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.generate_card_bills(uuid) from public, anon, authenticated;

-- 기록 페이지: 카드(신용카드 세부 항목)·납부일 기준 청구 기간과 금액
create or replace function public.card_bill_amount(p_card bigint, p_due date)
returns table (period_start date, period_end date, amount bigint)
language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.sources where id = p_card and user_id = auth.uid();
  if s.id is null or s.bill_start_offset is null or s.bill_end_offset is null then return; end if;
  period_start := public.card_bill_date(p_due, s.bill_start_offset, s.bill_start_day);
  period_end := public.card_bill_date(p_due, s.bill_end_offset, s.bill_end_day);
  amount := public.card_bill_total(auth.uid(), p_card, period_start, period_end);
  return next;
end;
$$;
grant execute on function public.card_bill_amount(bigint, date) to authenticated;

-- 카드 지출이 바뀌면 그 날짜를 포함하는 결제 대금 기록 금액 갱신
create or replace function public.recompute_card_bills(p_uid uuid, p_card bigint, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if p_card is null or p_date is null then return; end if;
  for b in
    select id, card_bill_period_start, card_bill_period_end from public.transactions
    where card_bill_source_id = p_card and user_id = p_uid
      and card_bill_period_start is not null and card_bill_period_end is not null
      and p_date between card_bill_period_start and card_bill_period_end
  loop
    update public.transactions
    set amount = greatest(public.card_bill_total(p_uid, p_card, b.card_bill_period_start, b.card_bill_period_end), 0)
    where id = b.id;
  end loop;
end;
$$;
revoke execute on function public.recompute_card_bills(uuid, bigint, date) from public, anon, authenticated;

create or replace function public.trg_card_bill_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 결제 대금 기록 자신(원천=연결 계좌)의 변경은 건너뜀
  if tg_op in ('UPDATE', 'DELETE') and old.card_bill_source_id is null and old.type = 'expense' then
    perform public.recompute_card_bills(old.user_id, old.source_id, old.date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.card_bill_source_id is null and new.type = 'expense'
     and (tg_op = 'INSERT' or old.source_id is distinct from new.source_id or old.date is distinct from new.date
          or old.amount is distinct from new.amount or old.type is distinct from new.type or old.onnuri is distinct from new.onnuri) then
    perform public.recompute_card_bills(new.user_id, new.source_id, new.date);
  end if;
  return null;
end;
$$;

drop trigger if exists card_bill_recompute on public.transactions;
create trigger card_bill_recompute
  after insert or update or delete on public.transactions
  for each row execute function public.trg_card_bill_recompute();
