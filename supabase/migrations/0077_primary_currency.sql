-- =====================================================================
-- 0077: 주 화폐 설정
--   · 설정 > 화폐 설정에서 주 화폐를 바꿀 수 있다(기본 KRW).
--   · 기록 금액(amount)은 계속 원화 기준으로 저장되고, 주 화폐가 원화가 아니면
--     새 기록은 주 화폐로 입력(input_currency 스냅샷)되며 합계·통계는 주 화폐로 환산해 보여준다.
--   · 본인 프로필은 RPC 로만 바꿀 수 있으므로(0019) 전용 RPC 를 둔다.
-- 0001~0076 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.profiles add column if not exists primary_currency text not null default 'KRW';

create or replace function public.set_my_primary_currency(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_code is null or p_code !~ '^[A-Z]{3}$' then
    raise exception '올바르지 않은 화폐 코드입니다.';
  end if;
  update public.profiles set primary_currency = p_code where id = auth.uid();
end;
$$;

grant execute on function public.set_my_primary_currency(text) to authenticated;
