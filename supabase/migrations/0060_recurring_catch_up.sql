-- =====================================================================
-- 0060: 반복 자동 등록 — 놓친 회차 자동 따라잡기
--   · 지금까지는 매일 실행(KST 00:00) 때 "오늘"이 반복 날짜인지만 확인해서, 그날 실행이 실패했거나
--     (cron 중단, 규칙 오류, 0059 이전의 다음 결제일 판단 오류 등) 건너뛰어진 회차는 다음 날 이후에도
--     영영 생성되지 않았다.
--   · recurring_rules.last_run_date(마지막으로 처리한 날짜)를 두고, 매일 실행 때 그 다음 날부터
--     오늘까지를 하루씩 훑어 아직 생성되지 않은 회차를 모두 생성한다(이미 생성된 날짜는 건너뜀).
--     처리한 날짜는 다시 훑지 않으므로, 사용자가 일부러 지운 자동 생성 내역이 되살아나지 않는다.
--   · 기존 규칙(last_run_date 없음)은 규칙을 만든 다음 날부터, 최대 60일 전까지만 따라잡는다
--     (규칙을 만들 때 "과거 반복 내역 일괄 생성"을 거절한 기간은 생성하지 않음).
-- 0001~0059 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.recurring_rules add column if not exists last_run_date date;

create or replace function public.generate_due_recurring_transactions()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  r public.recurring_rules;
  d date;
  until_date date;
begin
  for r in select * from public.recurring_rules where active and start_date <= today loop
    d := greatest(
      r.start_date + 1,
      coalesce(r.last_run_date + 1, (r.created_at at time zone 'Asia/Seoul')::date + 1),
      today - 60
    );
    until_date := least(today, coalesce(r.end_date, today));
    while d <= until_date loop
      begin
        perform public.generate_recurring_occurrence(r, d);
      exception when others then
        raise warning 'recurring rule % on % failed: %', r.id, d, sqlerrm;
      end;
      d := d + 1;
    end loop;
    update public.recurring_rules set last_run_date = today where id = r.id;
  end loop;
end;
$$;

-- 일괄 생성(backfill)으로 오늘까지 처리한 규칙은 다음 자동 실행 때 같은 기간을 다시 훑지 않도록 표시
create or replace function public.mark_recurring_rule_run(p_rule_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.recurring_rules set last_run_date = (now() at time zone 'Asia/Seoul')::date
  where id = p_rule_id and user_id = auth.uid();
$$;
