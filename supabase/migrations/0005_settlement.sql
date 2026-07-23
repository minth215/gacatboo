-- =====================================================================
-- 0005: 정산(N빵 등) 처리
--   · 수입 분류 '정산' 추가
--   · 정산 수입은 대상 지출을 가리킴(settlement_target_id)
--   · 통계는 정산 수입 제외 + 대상 지출을 정산액만큼 차감 (앱에서 계산)
-- 0001~0004 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions
  add column if not exists settlement_target_id bigint references public.transactions(id) on delete set null;
create index if not exists idx_tx_settlement_target on public.transactions(settlement_target_id);

-- 시드 함수 갱신: 수입 기본 분류에 '정산' 추가
create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inc_n text[] := array['월급','부수입','용돈','금융소득','정산'];
  inc_e text[] := array['💰','💵','🪙','📈','🤝'];
  exp_n text[] := array['식당','교통','쇼핑','문화생활','통신','보험','병원','교육','구독','기타'];
  exp_e text[] := array['🍽️','🚌','🛍️','🎬','📱','🛡️','🏥','📚','🔁','📦'];
  src   text[] := array['현금','은행','카드','기타'];
  gc_n  text[] := array['여행','구독','동거','N빵','기타'];
  gc_e  text[] := array['✈️','🔁','🏠','🍕','📦'];
  i int;
begin
  for i in 1 .. array_length(inc_n,1) loop
    insert into public.categories(user_id, type, name, emoji, sort_order) values (uid, 'income', inc_n[i], inc_e[i], i-1);
  end loop;
  for i in 1 .. array_length(exp_n,1) loop
    insert into public.categories(user_id, type, name, emoji, sort_order) values (uid, 'expense', exp_n[i], exp_e[i], i-1);
  end loop;
  for i in 1 .. array_length(src,1) loop
    insert into public.sources(user_id, parent_id, name, sort_order) values (uid, null, src[i], i-1);
  end loop;
  for i in 1 .. array_length(gc_n,1) loop
    insert into public.group_categories(user_id, name, emoji, sort_order) values (uid, gc_n[i], gc_e[i], i-1);
  end loop;
end;
$$;

-- 기존 사용자 백필: '정산' 수입 분류가 없으면 추가
insert into public.categories(user_id, type, name, emoji, sort_order)
select p.id, 'income', '정산', '🤝', 100
from public.profiles p
where not exists (
  select 1 from public.categories c where c.user_id = p.id and c.type = 'income' and c.name = '정산'
);
