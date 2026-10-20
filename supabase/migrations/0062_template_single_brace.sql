-- =====================================================================
-- 0062: 알림 템플릿 변수를 중괄호 한 번으로 표기({content}, {group_name}, {amount} 등)
--   · fill_template(): {변수} 를 치환(예전 표기 {{변수}} 도 계속 치환되도록 먼저 처리).
--   · 이미 저장된 템플릿 문구의 {{변수}} 를 {변수} 로 일괄 변환.
--   · 푸시 문구를 만드는 send-push Edge Function 도 같은 규칙으로 변경됨(재배포 필요:
--     supabase functions deploy send-push).
-- 0001~0061 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

create or replace function public.fill_template(tpl text, vars jsonb)
returns text language plpgsql immutable as $$
declare
  k text; v text; result text := coalesce(tpl, '');
begin
  if vars is null then return result; end if;
  for k, v in select * from jsonb_each_text(vars) loop
    result := replace(result, '{{' || k || '}}', coalesce(v, ''));
    result := replace(result, '{' || k || '}', coalesce(v, ''));
  end loop;
  return result;
end;
$$;

update public.notification_templates
set title_template = replace(replace(title_template, '{{', '{'), '}}', '}'),
    body_template  = replace(replace(body_template, '{{', '{'), '}}', '}'),
    updated_at = now()
where title_template like '%{{%' or body_template like '%{{%';
