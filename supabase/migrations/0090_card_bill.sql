-- =====================================================================
-- 0090: 신용카드 대금 납부
--   · 신용카드 그룹 세부 항목: 대금 납부일(payment_day, 기존) + 영업일 처리(payment_business_rule),
--     청구 기간(bill_start_offset/day ~ bill_end_offset/day: offset 은 납부월 기준 개월(-2 전전월, -1 전월, 0 당월),
--     day 31 이상은 그 달 말일), 대금 납부 자동 입력(auto_bill, 켠 날짜 auto_bill_since).
--   · 신용카드 그룹: 지출 반영 시점(expense_timing: 'usage' 카드 사용일 / 'payment' 대금 납부일).
--   · 자동 입력: 납부일(영업일 보정)이 되면 지출 기록 생성 — 내용 "{세부 항목명} 결제 대금", 분류 "결제 대금",
--     원천 = 연결 계좌, 금액 = 청구 기간 동안 그 카드로 기록한 지출 합계(실적 포함 여부 무관, 온누리 차감액 제외).
--     transactions.card_bill_source_id / card_bill_period_end 로 표시·중복 방지. 매일 KST 00:10 + 앱 접속 시 실행.
-- 0001~0089 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.sources add column if not exists payment_business_rule text not null default 'none';
alter table public.sources add column if not exists bill_start_offset smallint;
alter table public.sources add column if not exists bill_start_day smallint;
alter table public.sources add column if not exists bill_end_offset smallint;
alter table public.sources add column if not exists bill_end_day smallint;
alter table public.sources add column if not exists auto_bill boolean not null default false;
alter table public.sources add column if not exists auto_bill_since date;
alter table public.sources add column if not exists expense_timing text not null default 'usage';

alter table public.transactions add column if not exists card_bill_source_id bigint references public.sources(id) on delete set null;
alter table public.transactions add column if not exists card_bill_period_end date;
create index if not exists transactions_card_bill_idx on public.transactions (card_bill_source_id, card_bill_period_end) where card_bill_source_id is not null;

-- 회원별 온누리 차감액(0088 의 my_onnuri_deductions 와 같은 계산, 사용자 지정)
create or replace function public.onnuri_deductions_for(p_uid uuid)
returns table (tx_id bigint, source_id bigint, amount bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  s record;
  e record;
  bal bigint;
  d bigint;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_uid uuid := p_uid;
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
revoke execute on function public.onnuri_deductions_for(uuid) from public, anon, authenticated;

create or replace function public.my_onnuri_deductions()
returns table (tx_id bigint, source_id bigint, amount bigint)
language sql stable security definer set search_path = public as $$
  select * from public.onnuri_deductions_for(auth.uid());
$$;
grant execute on function public.my_onnuri_deductions() to authenticated;

-- 납부월(y, m) 기준 offset 개월의 day 일(그 달 말일로 보정)
create or replace function public.card_bill_date(p_month date, p_offset int, p_day int)
returns date language sql immutable as $$
  select (date_trunc('month', p_month) + make_interval(months => p_offset))::date
       + (least(greatest(coalesce(p_day, 1), 1),
                extract(day from (date_trunc('month', p_month) + make_interval(months => p_offset + 1) - interval '1 day'))::int) - 1);
$$;

-- 대금 납부 자동 입력(p_uid null 이면 전체 회원). 지난달·이번 달 납부일 중 오늘까지 도래했고 auto_bill_since 이후인 것.
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
  v_onnuri bigint;
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

      select coalesce(sum(t.amount), 0) into v_total from public.transactions t
      where t.user_id = s.user_id and t.source_id = s.id and t.type = 'expense' and t.date between v_start and v_end;
      select coalesce(sum(d.amount), 0) into v_onnuri
      from public.onnuri_deductions_for(s.user_id) d join public.transactions t on t.id = d.tx_id
      where t.source_id = s.id and t.type = 'expense' and t.date between v_start and v_end;
      v_total := v_total - v_onnuri;
      continue when v_total <= 0;

      insert into public.transactions(user_id, type, date, amount, category_id, category_name, category_emoji, category_color,
        source_id, source_name, content, memo, created_by, card_bill_source_id, card_bill_period_end)
      values (s.user_id, 'expense', v_due, v_total, v_cat.id, '결제 대금', coalesce(v_cat.emoji, ''), coalesce(v_cat.color, ''),
        v_link.id, coalesce(v_link.name, ''), s.name || ' 결제 대금', '', s.user_id, s.id, v_end);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.generate_card_bills(uuid) from public, anon, authenticated;

-- 앱 접속 시 내 카드 대금 생성
create or replace function public.generate_my_card_bills()
returns int language sql security definer set search_path = public as $$
  select public.generate_card_bills(auth.uid());
$$;
grant execute on function public.generate_my_card_bills() to authenticated;

-- 매일 KST 00:10(UTC 15:10)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'generate-card-bills';
    perform cron.schedule('generate-card-bills', '10 15 * * *', 'select public.generate_card_bills();');
  end if;
end $$;
