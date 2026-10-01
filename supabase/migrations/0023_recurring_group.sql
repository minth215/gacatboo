-- =====================================================================
-- 0023: 그룹 가계부 항목도 반복 설정 가능하도록 확장
--   · recurring_rules.group_id — 그룹 안에서 건 반복이면 그 그룹(그룹 삭제 시 반복도 함께 삭제).
--     null이면 개인 반복.
--   · generate_due_recurring_transactions() 를 다시 정의해 생성되는 거래에도 group_id 를 그대로
--     반영(그룹 가계부에 그대로 보임). 개인 가계부 조회는 db.js 의 listTransactions 에서
--     "group_id가 없거나 recurring_id가 있는" 항목을 보여주도록 이미 수정됨 — 반복으로 생성된
--     그룹 거래가 그룹 카드 스타일로 개인 가계부에도 함께 노출됨.
-- 0001~0022 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists group_id bigint references public.groups(id) on delete cascade;
create index if not exists idx_recurring_rules_group on public.recurring_rules(group_id);

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
        user_id, group_id, type, date, amount, category_id, category_name, category_emoji, category_color,
        source_id, source_name, content, memo, created_by, recurring_id
      ) values (
        r.user_id, r.group_id, r.type, today, r.amount, r.category_id, r.category_name, r.category_emoji, r.category_color,
        r.source_id, r.source_name, r.content, r.memo, r.user_id, r.id
      );
    end if;
  end loop;
end;
$$;
