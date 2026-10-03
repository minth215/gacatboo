-- =====================================================================
-- 0033: 영업일 보정에 공휴일까지 반영(기존엔 토·일요일만 제외했음)
--   · public.kr_holidays — 대한민국 공휴일 날짜 테이블(date, name).
--     - 고정 공휴일(신정/삼일절/어린이날/현충일/광복절/개천절/한글날/성탄절)은
--       매년 날짜가 같아 폭넓은 연도 범위로 자동 생성.
--     - 음력 공휴일(설날/추석/부처님오신날)과 대체공휴일은 해마다 날짜가
--       달라 자동 계산이 불가능해 알려진 연도만 직접 입력했음(2025년).
--       이후 연도는 공식 달력이 확정되는 대로 별도 마이그레이션으로
--       추가해야 함 — 지금 이 테이블에 없는 미래의 음력 공휴일/대체공휴일은
--       평일로 간주되어 영업일 보정에서 제외되지 않으니 주의.
--   · adjust_business_day(d, rule) — 토·일요일뿐 아니라 kr_holidays 에 있는
--     날짜도 피해서, 연휴가 여러 날 이어져도(예: 설날 연휴) 실제 평일을
--     찾을 때까지 하루씩 물러나거나(전 영업일) 전진한다(후 영업일).
-- 0001~0032 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.kr_holidays (
  date date primary key,
  name text not null
);

-- 고정 공휴일: 넉넉한 연도 범위(2015~2040)로 자동 생성. 이미 들어있는 날짜는 건너뜀.
insert into public.kr_holidays (date, name)
select make_date(y, 1, 1), '신정' from generate_series(2015, 2040) as y
union all select make_date(y, 3, 1), '삼일절' from generate_series(2015, 2040) as y
union all select make_date(y, 5, 5), '어린이날' from generate_series(2015, 2040) as y
union all select make_date(y, 6, 6), '현충일' from generate_series(2015, 2040) as y
union all select make_date(y, 8, 15), '광복절' from generate_series(2015, 2040) as y
union all select make_date(y, 10, 3), '개천절' from generate_series(2015, 2040) as y
union all select make_date(y, 10, 9), '한글날' from generate_series(2015, 2040) as y
union all select make_date(y, 12, 25), '성탄절' from generate_series(2015, 2040) as y
on conflict (date) do nothing;

-- 음력 공휴일/대체공휴일: 2025년만 확실히 알고 있어 우선 입력. 2026년 이후는
-- 공식 발표 확인 후 추가 마이그레이션 필요.
insert into public.kr_holidays (date, name) values
  ('2025-01-27', '임시공휴일'),
  ('2025-01-28', '설날 연휴'),
  ('2025-01-29', '설날'),
  ('2025-01-30', '설날 연휴'),
  ('2025-03-03', '삼일절 대체공휴일'),
  ('2025-05-06', '어린이날·부처님오신날 대체공휴일'),
  ('2025-10-05', '추석 연휴'),
  ('2025-10-06', '추석'),
  ('2025-10-07', '추석 연휴'),
  ('2025-10-08', '추석 대체공휴일')
on conflict (date) do nothing;

create or replace function public.is_business_day(d date)
returns boolean language sql stable as $$
  select extract(dow from d)::int not in (0, 6)
    and not exists (select 1 from public.kr_holidays h where h.date = d);
$$;

create or replace function public.adjust_business_day(d date, rule text)
returns date language plpgsql stable as $$
declare
  result date := d;
  guard int := 0;
begin
  if rule = 'before' then
    while not public.is_business_day(result) and guard < 14 loop
      result := result - 1;
      guard := guard + 1;
    end loop;
  elsif rule = 'after' then
    while not public.is_business_day(result) and guard < 14 loop
      result := result + 1;
      guard := guard + 1;
    end loop;
  end if;
  return result;
end;
$$;
