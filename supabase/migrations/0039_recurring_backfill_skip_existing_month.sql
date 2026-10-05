-- =====================================================================
-- 0039: 반복 항목 일괄 생성(backfill) 시, 이미 그 달에 등록된 내역은 건너뛰기
--   기록 페이지에서 과거 날짜로 반복을 새로 걸고 "밀린 회차를 한 번에 생성"을 선택했을 때,
--   그 달에 같은 분류로 이미 적어둔 내역(수동 입력 포함)이 있으면 중복 생성하지 않는다.
--   월/연 반복(개인 가계부 항목, target이 없는 경우)에만 적용한다 — 반복 간격이 짧은
--   일/주 반복이나 구독 그룹 결제/입금은 "그 달에 하나만" 개념이 없어 기존 동작을 유지한다.
-- 0001~0038 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.backfill_recurring_rule(p_rule_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_rules;
  d date;
  today date := (now() at time zone 'Asia/Seoul')::date;
  n int := 0;
  v_skip_month boolean;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if not found then raise exception '반복 규칙을 찾을 수 없습니다.'; end if;
  if r.user_id <> auth.uid() then raise exception '권한이 없습니다.'; end if;

  d := r.start_date + 1;
  while d <= today loop
    v_skip_month := false;
    if r.target is null and r.freq_unit in ('month', 'year') then
      v_skip_month := exists (
        select 1 from public.transactions t
        where t.user_id = r.user_id
          and coalesce(t.group_id, -1) = coalesce(r.group_id, -1)
          and t.category_name = r.category_name
          and date_trunc('month', t.date) = date_trunc('month', d)
      );
    end if;
    if not v_skip_month and public.generate_recurring_occurrence(r, d) then n := n + 1; end if;
    d := d + 1;
  end loop;
  return n;
end;
$$;
