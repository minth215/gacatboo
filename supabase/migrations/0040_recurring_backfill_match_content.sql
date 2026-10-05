-- =====================================================================
-- 0040: 반복 일괄 생성(backfill)의 "이미 등록된 달" 판정에 내용(content)도 포함
--   0039에서는 분류(category_name)만 같으면 그 달을 건너뛰었는데, 같은 분류의
--   다른 내역까지 걸러져 과하게 건너뛸 수 있었다. 분류와 내용이 모두 같을 때만
--   "이미 등록된 달"로 본다.
-- 0001~0039 이후 실행. 여러 번 실행해도 안전.
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
          and coalesce(t.content, '') = coalesce(r.content, '')
          and date_trunc('month', t.date) = date_trunc('month', d)
      );
    end if;
    if not v_skip_month and public.generate_recurring_occurrence(r, d) then n := n + 1; end if;
    d := d + 1;
  end loop;
  return n;
end;
$$;
