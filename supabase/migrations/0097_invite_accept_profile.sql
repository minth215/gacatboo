-- =====================================================================
-- 0097: 그룹 초대 수락 시 닉네임·출금 수단 설정
--   · group_members.self_nickname    — 멤버가 수락하며 정한 그룹 내 닉네임(총무/총대가 아닌 멤버들에게 보임)
--   · group_members.withdraw_source_id — 멤버의 출금 수단(입금 내역의 멤버 쪽 원천, 멤버 본인의 원천)
--   · accept_group_invite(멤버, 닉네임, 원천): 수락 + 위 값 저장 + 수락 전에 입력된 입금 내역의 비어 있는
--     멤버 원천을 채움(멤버 가계부 미러 기록 포함).
--   · 이후 입금 내역/미러 기록도 멤버 원천이 비어 있으면 출금 수단으로 채움(트리거).
--   · get_group_invite_info: 초대받은 사람이 수락 모달에서 볼 그룹 이름·기본 닉네임.
-- 0001~0096 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.group_members add column if not exists self_nickname text;
alter table public.group_members add column if not exists withdraw_source_id bigint references public.sources(id) on delete set null;

create or replace function public.get_group_invite_info(p_member_id bigint)
returns table (group_name text, nickname text, status text)
language sql stable security definer set search_path = public as $$
  select g.name, m.nickname, m.status
  from public.group_members m join public.groups g on g.id = m.group_id
  where m.id = p_member_id and m.user_id = auth.uid();
$$;
grant execute on function public.get_group_invite_info(bigint) to authenticated;

create or replace function public.accept_group_invite(p_member_id bigint, p_nickname text, p_source_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_src record;
  v_group bigint;
begin
  perform public.respond_to_group_invite(p_member_id, true);
  select group_id into v_group from public.group_members where id = p_member_id;
  select id, name into v_src from public.sources where id = p_source_id and user_id = v_uid;

  update public.group_members
  set self_nickname = nullif(btrim(coalesce(p_nickname, '')), ''), withdraw_source_id = v_src.id
  where id = p_member_id and user_id = v_uid;

  if v_src.id is not null then
    -- 수락 전에 입력된 입금 내역: 비어 있는 멤버 원천을 채움(동기화 트리거가 미러 기록 원천 이름도 갱신)
    update public.subscription_deposits set source_id = v_src.id, source_name = v_src.name
    where member_id = p_member_id and coalesce(source_name, '') = '';
    update public.transactions set source_id = v_src.id, source_name = v_src.name
    where user_id = v_uid and origin_type = 'deposit' and type = 'expense' and origin_group_id = v_group and source_id is null;
  end if;
end;
$$;
grant execute on function public.accept_group_invite(bigint, text, bigint) to authenticated;

-- 입금 내역: 멤버 원천이 비어 있으면 그 멤버의 출금 수단으로
create or replace function public.trg_deposit_member_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_src record;
begin
  if coalesce(new.source_name, '') = '' and new.member_id is not null then
    select s.id, s.name into v_src from public.group_members m join public.sources s on s.id = m.withdraw_source_id
    where m.id = new.member_id;
    if v_src.id is not null then new.source_id := v_src.id; new.source_name := v_src.name; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists deposit_member_source on public.subscription_deposits;
create trigger deposit_member_source before insert or update on public.subscription_deposits
  for each row execute function public.trg_deposit_member_source();

-- 멤버 가계부 미러(입금 → 멤버 지출): 원천 id 가 비어 있으면 출금 수단으로
create or replace function public.trg_deposit_mirror_member_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_src record;
begin
  if new.origin_type = 'deposit' and new.type = 'expense' and new.source_id is null and new.origin_group_id is not null then
    select s.id, s.name into v_src from public.group_members m join public.sources s on s.id = m.withdraw_source_id
    where m.group_id = new.origin_group_id and m.user_id = new.user_id limit 1;
    if v_src.id is not null and (coalesce(new.source_name, '') = '' or new.source_name = v_src.name) then
      new.source_id := v_src.id; new.source_name := v_src.name;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists deposit_mirror_member_source on public.transactions;
create trigger deposit_mirror_member_source before insert or update on public.transactions
  for each row execute function public.trg_deposit_mirror_member_source();
