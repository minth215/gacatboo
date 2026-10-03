-- =====================================================================
-- 0035: 알림 시스템(인앱 피드 + 관리자 템플릿 + 사용자 설정 + 푸시 구독)
--   · notification_templates — 관리자가 관리하는 상황별(event_key) 알림 템플릿
--     (제목/본문/이모지/배경색). 본문·제목은 {{변수}} 치환을 지원.
--   · notifications — 사용자별 인앱 알림 피드(실제 발송 내역). 푸시 허용 여부와
--     무관하게 항상 쌓이며, 알림 탭에서 보여준다.
--   · user_notification_settings — 푸시 전체 on/off.
--   · user_notification_event_prefs — 상황별 푸시 on/off(없으면 기본 on).
--   · push_subscriptions — 기기별 Web Push 구독 정보.
--   · notify_user() — SECURITY DEFINER RPC. 템플릿을 찾아 변수 치환 후
--     notifications 행을 만든다. group_id 가 vars 에 있으면 호출자와
--     수신자가 같은 그룹 멤버인지 확인해 임의 사용자 스팸을 막는다.
-- 0001~0034 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create table if not exists public.notification_templates (
  id             bigint generated always as identity primary key,
  event_key      text not null unique,
  title_template text not null default '',
  body_template  text not null default '',
  emoji          text not null default '🔔',
  color          text not null default '#FFE9EF',
  active         boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_key  text not null,
  title      text not null default '',
  body       text not null default '',
  emoji      text not null default '🔔',
  color      text not null default '#FFE9EF',
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);

create table if not exists public.user_notification_settings (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default false,
  updated_at   timestamptz not null default now()
);

create table if not exists public.user_notification_event_prefs (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_key  text not null,
  enabled    boolean not null default true,
  primary key (user_id, event_key)
);

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.notification_templates      enable row level security;
alter table public.notifications                enable row level security;
alter table public.user_notification_settings   enable row level security;
alter table public.user_notification_event_prefs enable row level security;
alter table public.push_subscriptions           enable row level security;

-- 활성 템플릿 목록(제목/이모지 등)은 설정 화면에서 "상황별 알림 on/off" 목록을 보여줄 때
-- 필요해 로그인한 사용자 전원에게 조회를 허용한다(쓰기는 관리자만).
drop policy if exists notification_templates_select on public.notification_templates;
create policy notification_templates_select on public.notification_templates
  for select to authenticated using (true);
drop policy if exists notification_templates_admin_write on public.notification_templates;
create policy notification_templates_admin_write on public.notification_templates
  for insert to authenticated with check (public.is_admin(auth.uid()));
drop policy if exists notification_templates_admin_update on public.notification_templates;
create policy notification_templates_admin_update on public.notification_templates
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists notification_templates_admin_delete on public.notification_templates;
create policy notification_templates_admin_delete on public.notification_templates
  for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());
-- insert 는 notify_user() 를 통해서만(타인에게도 알림을 만들어야 하므로 SECURITY DEFINER 로 처리).

drop policy if exists user_notification_settings_own on public.user_notification_settings;
create policy user_notification_settings_own on public.user_notification_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_notification_event_prefs_own on public.user_notification_event_prefs;
create policy user_notification_event_prefs_own on public.user_notification_event_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- {{key}} 형태의 자리표시자를 vars(jsonb) 값으로 치환.
create or replace function public.fill_template(tpl text, vars jsonb)
returns text language plpgsql immutable as $$
declare
  k text; v text; result text := coalesce(tpl, '');
begin
  if vars is null then return result; end if;
  for k, v in select * from jsonb_each_text(vars) loop
    result := replace(result, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return result;
end;
$$;

-- 상황(event_key)에 맞는 템플릿을 찾아 변수 치환 후 인앱 알림을 만든다.
-- vars 에 group_id 가 있으면, 호출자와 수신자가 같은 그룹의 멤버인지 확인해서
-- 아무 사용자에게나 알림을 보내지 못하도록 막는다(그룹과 무관한 event_key는 검사 생략).
create or replace function public.notify_user(p_user_id uuid, p_event_key text, p_vars jsonb default '{}'::jsonb, p_link text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  t public.notification_templates;
  new_id bigint;
  v_group_id bigint;
begin
  if p_vars ? 'group_id' then
    v_group_id := (p_vars->>'group_id')::bigint;
    if not exists (
      select 1 from public.groups g
      where g.id = v_group_id
        and exists (select 1 from public.group_members gm1 where gm1.group_id = g.id and gm1.user_id = auth.uid())
        and exists (select 1 from public.group_members gm2 where gm2.group_id = g.id and gm2.user_id = p_user_id)
    ) then
      raise exception '알림을 보낼 권한이 없습니다.';
    end if;
  end if;

  select * into t from public.notification_templates where event_key = p_event_key and active;
  if not found then return null; end if;

  insert into public.notifications (user_id, event_key, title, body, emoji, color, link)
  values (p_user_id, p_event_key, public.fill_template(t.title_template, p_vars), public.fill_template(t.body_template, p_vars), t.emoji, t.color, p_link)
  returning id into new_id;

  return new_id;
end;
$$;
grant execute on function public.notify_user(uuid, text, jsonb, text) to authenticated;

insert into public.notification_templates (event_key, title_template, body_template, emoji, color) values
  ('group_invite', '그룹 초대', '{{group_name}} 그룹에 멤버로 초대되었어요.', '👋', '#E6EEFD'),
  ('settlement_request', '정산 요청', '{{group_name}}에서 {{amount}}원 정산을 요청했어요.', '💌', '#FDE8EE'),
  ('recurring_registered', '반복 항목 등록', '{{group_name}}에 반복 항목이 등록되었어요: {{content}}', '🔁', '#FBF1D3')
on conflict (event_key) do nothing;
