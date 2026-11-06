-- =====================================================================
-- 0109: 월/연 반복의 기준 일자(anchor_day)
--   · 매월 30·31일처럼 그 달에 없는 일자는 말일에 처리(원래도 그렇게 계산됨). 다만 반복 시작일이
--     짧은 달(예: 2월)이면 시작일이 2/28 로 저장돼 이후 달도 28일로 계산되던 문제가 있어, 원래 일자를
--     recurring_rules.anchor_day 로 따로 저장하고 반복일 판정·시작일 맞춤에 사용한다.
--   · 기존 규칙은 시작일의 일자로 채움. 새 규칙에 값이 없으면 시작일의 일자로 자동 채움.
-- 0001~0108 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists anchor_day smallint;
update public.recurring_rules set anchor_day = extract(day from start_date)::int where anchor_day is null and start_date is not null;

create or replace function public.recurring_rules_fill_anchor()
returns trigger language plpgsql as $$
begin
  if NEW.anchor_day is null and NEW.start_date is not null then NEW.anchor_day := extract(day from NEW.start_date)::int; end if;
  return NEW;
end;
$$;
drop trigger if exists trg_recurring_rules_fill_anchor on public.recurring_rules;
create trigger trg_recurring_rules_fill_anchor before insert on public.recurring_rules
  for each row execute function public.recurring_rules_fill_anchor();

create or replace function public.recurring_due_nominal(r public.recurring_rules, check_date date)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  due boolean := false;
  v_nominal date;
  -- 월/연 반복 기준 일자(anchor_day, 없으면 시작일의 일자). 그 달에 없으면 말일
  months_since int; years_since int;
  week_start_rule date; week_start_check date; weeks_since int;
  target_day int; i int; cand_month date; cand_year int; nominal_date date; adj_date date;
begin
  if check_date < r.start_date then return null; end if;
  if r.end_date is not null and check_date > r.end_date then return null; end if;
  -- 반복 시작일 회차는 반복을 등록한 원래 기록이 담당하므로 자동으로 만들지 않는다
  -- (반복 등록 시 반복 날짜를 기록 날짜와 다르게 지정한 경우, 그 달/해의 회차가 중복 생성되지 않게).
  -- (정기 입금 설정처럼 기록 없이 규칙만 만든 경우(generate_on_start)는 시작일 회차도 생성)
  if check_date = r.start_date and not coalesce(r.generate_on_start, false) then return null; end if;

  if r.freq_unit = 'day' then
    due := ((check_date - r.start_date) % r.freq_interval) = 0;

  elsif r.freq_unit = 'week' then
    week_start_rule := r.start_date - extract(dow from r.start_date)::int;
    week_start_check := check_date - extract(dow from check_date)::int;
    weeks_since := (week_start_check - week_start_rule) / 7;
    due := (weeks_since % r.freq_interval = 0) and (extract(dow from check_date)::int = any(r.weekdays));

  elsif r.freq_unit = 'month' then
    for i in -1..1 loop
      cand_month := (date_trunc('month', check_date) + make_interval(months => i))::date;
      months_since := (extract(year from cand_month)::int - extract(year from r.start_date)::int) * 12
                     + (extract(month from cand_month)::int - extract(month from r.start_date)::int);
      if months_since >= 0 and months_since % r.freq_interval = 0 then
        target_day := least(
          coalesce(r.anchor_day, extract(day from r.start_date)::int),
          extract(day from (cand_month + interval '1 month - 1 day'))::int
        );
        nominal_date := cand_month + (target_day - 1);
        adj_date := public.adjust_business_day(nominal_date, r.business_day_rule);
        if adj_date = check_date then due := true; v_nominal := nominal_date; end if;
      end if;
    end loop;

  elsif r.freq_unit = 'year' then
    for i in -1..1 loop
      cand_year := extract(year from check_date)::int + i;
      years_since := cand_year - extract(year from r.start_date)::int;
      if years_since >= 0 and years_since % r.freq_interval = 0 then
        target_day := least(
          coalesce(r.anchor_day, extract(day from r.start_date)::int),
          extract(day from (date_trunc('month', make_date(cand_year, extract(month from r.start_date)::int, 1)) + interval '1 month - 1 day'))::int
        );
        nominal_date := make_date(cand_year, extract(month from r.start_date)::int, target_day);
        adj_date := public.adjust_business_day(nominal_date, r.business_day_rule);
        if adj_date = check_date then due := true; v_nominal := nominal_date; end if;
      end if;
    end loop;
  end if;

  if not due then return null; end if;
  return coalesce(v_nominal, check_date);
end;
$$;


drop function if exists public.recurring_align_start(date, date, text, int);
create or replace function public.recurring_align_start(p_old date, p_new date, p_unit text, p_interval int, p_anchor int default null)
returns date language plpgsql immutable as $$
declare cand date; y int; m int;
begin
  if p_new is null then return p_old; end if;
  if p_unit = 'month' then
    for i in 0..24 loop
      cand := (date_trunc('month', p_new) + make_interval(months => i * greatest(p_interval, 1)))::date;
      cand := cand + (least(coalesce(p_anchor, extract(day from p_old)::int), extract(day from (cand + interval '1 month - 1 day'))::int) - 1);
      if cand >= p_new then return cand; end if;
    end loop;
    return p_new;
  elsif p_unit = 'year' then
    m := extract(month from p_old)::int;
    for i in 0..10 loop
      y := extract(year from p_new)::int + i * greatest(p_interval, 1);
      cand := make_date(y, m, 1);
      cand := cand + (least(coalesce(p_anchor, extract(day from p_old)::int), extract(day from (cand + interval '1 month - 1 day'))::int) - 1);
      if cand >= p_new then return cand; end if;
    end loop;
    return p_new;
  end if;
  return p_new;
end;
$$;

create or replace function public.sync_member_rule_dates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.end_date is distinct from OLD.end_date then
    update public.recurring_rules r set end_date = NEW.end_date
    where (r.target = 'subscription_deposit' and r.member_id = NEW.id)
       or (NEW.role = 'owner' and r.target = 'subscription_payment' and r.group_id = NEW.group_id);
  end if;
  if NEW.start_date is distinct from OLD.start_date and NEW.start_date is not null then
    update public.recurring_rules r set start_date = public.recurring_align_start(r.start_date, NEW.start_date, r.freq_unit, r.freq_interval, r.anchor_day)
    where (r.target = 'subscription_deposit' and r.member_id = NEW.id)
       or (NEW.role = 'owner' and r.target = 'subscription_payment' and r.group_id = NEW.group_id);
  end if;
  return NEW;
end;
$$;

create or replace function public.preview_recurring_backfill(p_rule jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_rules;
  v_id bigint;
  v_n int := 0;
begin
  r := jsonb_populate_record(null::public.recurring_rules, p_rule);
  if r.group_id is not null and not (public.is_group_member(r.group_id, auth.uid()) or public.is_group_owner(r.group_id, auth.uid())) then
    raise exception '권한이 없습니다.';
  end if;
  begin
    insert into public.recurring_rules (
      user_id, group_id, member_id, target, type, amount, category_name, category_emoji, source_name,
      content, memo, leader_category_name, leader_category_emoji, deposit_source_name,
      start_date, end_date, freq_unit, freq_interval, weekdays, business_day_rule, label, generate_on_start, active, anchor_day
    ) values (
      auth.uid(), r.group_id, r.member_id, coalesce(r.target, 'transaction'), coalesce(r.type, 'expense'), coalesce(r.amount, 0),
      coalesce(r.category_name, ''), coalesce(r.category_emoji, ''), coalesce(r.source_name, ''),
      coalesce(r.content, ''), '', coalesce(r.leader_category_name, ''), coalesce(r.leader_category_emoji, ''), coalesce(r.deposit_source_name, ''),
      r.start_date, r.end_date, r.freq_unit, coalesce(r.freq_interval, 1), coalesce(r.weekdays, '{}'), coalesce(r.business_day_rule, 'none'),
      coalesce(r.label, ''), coalesce(r.generate_on_start, false), true, r.anchor_day
    ) returning id into v_id;
    if coalesce(r.generate_on_start, false) then v_n := public.backfill_group_rule(v_id);
    else v_n := public.backfill_recurring_rule(v_id);
    end if;
    raise exception using errcode = 'P0099', message = 'preview rollback';
  exception when sqlstate 'P0099' then
    null; -- 생성한 내용은 모두 되돌림(개수만 남김)
  end;
  return v_n;
end;
$$;
grant execute on function public.preview_recurring_backfill(jsonb) to authenticated;
