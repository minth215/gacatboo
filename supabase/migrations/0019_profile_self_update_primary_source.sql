-- =====================================================================
-- 0019: 내 정보(닉네임/아이디) 자가 수정 + 원천의 주결제수단/주입금수단 지정
--   · profiles 는 관리자만 UPDATE 가능(RLS)이라, 본인 닉네임/아이디 변경은
--     SECURITY DEFINER RPC(update_my_profile)로 좁게 허용
--   · sources 에 is_primary_payment/is_primary_deposit 플래그 추가.
--     사용자당 하나씩만 지정되도록 부분 유니크 인덱스로 강제하고,
--     지정/해제는 SECURITY DEFINER RPC(set_primary_source)로 원자적으로 처리
-- 0001~0018 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.update_my_profile(p_username text, p_display_name text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_username text := nullif(trim(p_username), '');
  v_display_name text := nullif(trim(p_display_name), '');
  v_row public.profiles;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if v_username is null then raise exception '아이디를 입력하세요.'; end if;
  if v_display_name is null then raise exception '닉네임을 입력하세요.'; end if;
  if exists (select 1 from public.profiles where username = v_username and id <> v_uid) then
    raise exception '이미 사용 중인 아이디입니다.';
  end if;
  update public.profiles set username = v_username, display_name = v_display_name
    where id = v_uid
    returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.update_my_profile(text, text) to authenticated;

alter table public.sources add column if not exists is_primary_payment boolean not null default false;
alter table public.sources add column if not exists is_primary_deposit boolean not null default false;
create unique index if not exists idx_sources_primary_payment on public.sources(user_id) where is_primary_payment;
create unique index if not exists idx_sources_primary_deposit on public.sources(user_id) where is_primary_deposit;

create or replace function public.set_primary_source(p_source_id bigint, p_kind text, p_value boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_kind not in ('payment', 'deposit') then raise exception '잘못된 종류입니다.'; end if;
  if not exists (select 1 from public.sources where id = p_source_id and user_id = v_uid) then
    raise exception '원천을 찾을 수 없습니다.';
  end if;
  if p_kind = 'payment' then
    if p_value then
      update public.sources set is_primary_payment = false where user_id = v_uid and is_primary_payment and id <> p_source_id;
      update public.sources set is_primary_payment = true where id = p_source_id;
    else
      update public.sources set is_primary_payment = false where id = p_source_id;
    end if;
  else
    if p_value then
      update public.sources set is_primary_deposit = false where user_id = v_uid and is_primary_deposit and id <> p_source_id;
      update public.sources set is_primary_deposit = true where id = p_source_id;
    else
      update public.sources set is_primary_deposit = false where id = p_source_id;
    end if;
  end if;
end;
$$;
grant execute on function public.set_primary_source(bigint, text, boolean) to authenticated;
