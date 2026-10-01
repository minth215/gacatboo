-- =====================================================================
-- 0022: 반복 수입/지출
--   · recurring_rules — 사용자가 만든 반복 규칙(매일/매주/매월/매년/사용자화 등).
--     freq_unit('day'|'week'|'month'|'year') + freq_interval(N) + weekdays(freq_unit='week'일 때만,
--     0=일~6=토) 조합으로 모든 프리셋(매일/평일/주말/매주/격주/매월/N개월마다/매년/사용자화)을 표현.
--   · transactions.recurring_id — 이 거래가 어느 반복 규칙에서 생성됐는지(기록 페이지의
--     반복 아이콘 on/off 판단용). 규칙이 삭제되면 null로 떨어짐(과거 내역은 그대로 남음).
--   · generate_due_recurring_transactions() — 활성 규칙을 훑어 오늘(KST) 날짜가 조건에 맞으면
--     거래를 자동 생성. pg_cron으로 매일 UTC 15:00(=KST 00:00)에 실행.
-- 0001~0021 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.recurring_rules (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null check (type in ('income','expense')),
  amount         bigint not null check (amount >= 0),
  category_id    bigint references public.categories(id) on delete set null,
  category_name  text not null default '',
  category_emoji text not null default '',
  category_color text not null default '',
  source_id      bigint references public.sources(id) on delete set null,
  source_name    text not null default '',
  content        text not null default '',
  memo           text not null default '',
  start_date     date not null,
  freq_unit      text not null check (freq_unit in ('day','week','month','year')),
  freq_interval  int  not null default 1 check (freq_interval >= 1),
  weekdays       int[] not null default '{}',  -- freq_unit='week'일 때만 사용(0=일 ... 6=토)
  label          text not null default '',     -- 반복 관리 목록 표시용(예: "매월", "3주마다")
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists idx_recurring_rules_user on public.recurring_rules(user_id);
create index if not exists idx_recurring_rules_active on public.recurring_rules(active) where active;

alter table public.recurring_rules enable row level security;
drop policy if exists recurring_rules_all on public.recurring_rules;
create policy recurring_rules_all on public.recurring_rules
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.transactions add column if not exists recurring_id bigint references public.recurring_rules(id) on delete set null;
create index if not exists idx_tx_recurring on public.transactions(recurring_id);

-- ---------------------------------------------------------------------
-- 매일 실행되는 생성 함수. 각 활성 규칙에 대해 오늘(KST)이 조건에 맞고
-- 아직 그 날짜로 생성된 거래가 없으면 새 거래를 만든다(중복 생성 방지는
-- "그 규칙·그 날짜의 거래가 이미 있는가"로 직접 확인 — 별도 북키핑 불필요).
-- ---------------------------------------------------------------------
create or replace function public.generate_due_recurring_transactions()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  r record;
  due boolean;
  months_since int;
  years_since int;
  week_start_rule date;
  week_start_today date;
  weeks_since int;
  target_day int;
begin
  for r in select * from public.recurring_rules where active and start_date <= today loop
    due := false;

    if r.freq_unit = 'day' then
      due := ((today - r.start_date) % r.freq_interval) = 0;

    elsif r.freq_unit = 'week' then
      week_start_rule := r.start_date - extract(dow from r.start_date)::int;
      week_start_today := today - extract(dow from today)::int;
      weeks_since := (week_start_today - week_start_rule) / 7;
      due := (weeks_since % r.freq_interval = 0) and (extract(dow from today)::int = any(r.weekdays));

    elsif r.freq_unit = 'month' then
      months_since := (extract(year from today)::int - extract(year from r.start_date)::int) * 12
                    + (extract(month from today)::int - extract(month from r.start_date)::int);
      target_day := least(
        extract(day from r.start_date)::int,
        extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int
      );
      due := (months_since >= 0) and (months_since % r.freq_interval = 0) and (extract(day from today)::int = target_day);

    elsif r.freq_unit = 'year' then
      years_since := extract(year from today)::int - extract(year from r.start_date)::int;
      target_day := least(
        extract(day from r.start_date)::int,
        extract(day from (date_trunc('month', make_date(extract(year from today)::int, extract(month from r.start_date)::int, 1)) + interval '1 month - 1 day'))::int
      );
      due := (years_since >= 0) and (years_since % r.freq_interval = 0)
             and (extract(month from today)::int = extract(month from r.start_date)::int)
             and (extract(day from today)::int = target_day);
    end if;

    if due and not exists (select 1 from public.transactions t where t.recurring_id = r.id and t.date = today) then
      insert into public.transactions (
        user_id, type, date, amount, category_id, category_name, category_emoji, category_color,
        source_id, source_name, content, memo, created_by, recurring_id
      ) values (
        r.user_id, r.type, today, r.amount, r.category_id, r.category_name, r.category_emoji, r.category_color,
        r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- pg_cron 활성화 + 매일 UTC 15:00(KST 00:00) 실행 예약. 같은 이름의 작업이 있으면
-- 먼저 해제 후 재등록(여러 번 실행해도 안전).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'generate-recurring-transactions') then
    perform cron.unschedule('generate-recurring-transactions');
  end if;
end $$;

select cron.schedule('generate-recurring-transactions', '0 15 * * *', $$select public.generate_due_recurring_transactions();$$);
