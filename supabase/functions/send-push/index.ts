// 실제 OS 푸시 발송 Edge Function — notify_user() RPC로 인앱 알림이 쌓인 뒤,
// 수신자가 푸시를 켜둔 경우에만 Web Push로 실제 알림을 보낸다.
// 배포: supabase functions deploy send-push
// 필요한 시크릿: VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:...)
// 호출: supabase.functions.invoke('send-push', { body: { userId, eventKey, vars, link } })
//
// vars.group_id 로 호출자·수신자가 같은 그룹 멤버인지 확인해(notify_user()와 동일한 규칙),
// 클라이언트에서 임의 사용자에게 푸시를 보내는 것을 막는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const VAPID_PUBLIC_KEY = 'BBni0SbdGd9a6SeST_CgnJTtuBbkfOqR32Oh0yp4ibpM-KgBKygRs4_9KZWrToKNpbmGBPsjp1iaGY7b0u3Jgxw';

const fillTemplate = (tpl: string, vars: Record<string, unknown>) =>
  Object.entries(vars || {}).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), tpl || '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!vapidPrivateKey || !vapidSubject) {
    return json({ error: 'VAPID_PRIVATE_KEY / VAPID_SUBJECT 시크릿이 설정되지 않았습니다.' }, 500);
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: '인증이 필요합니다.' }, 401);
  const callerId = userData.user.id;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400);
  }
  const { userId, eventKey, vars = {}, link } = payload;
  if (!userId || !eventKey) return json({ error: 'userId, eventKey가 필요합니다.' }, 400);

  try {
    // 스팸 방지: notify_user() RPC와 동일하게, group_id가 있을 때 호출자·수신자가
    // 같은 그룹의 멤버인지 확인한다(그룹과 무관한 상황은 아직 없으므로 없으면 거부).
    const groupId = vars?.group_id;
    if (!groupId) return json({ error: '권한을 확인할 수 없습니다.' }, 403);
    const [{ data: callerM }, { data: targetM }] = await Promise.all([
      admin.from('group_members').select('id').eq('group_id', groupId).eq('user_id', callerId).maybeSingle(),
      admin.from('group_members').select('id').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
    ]);
    if (!callerM || !targetM) return json({ error: '알림을 보낼 권한이 없습니다.' }, 403);

    const { data: settings } = await admin.from('user_notification_settings').select('push_enabled').eq('user_id', userId).maybeSingle();
    if (!settings?.push_enabled) return json({ message: '수신자가 푸시 알림을 꺼두었습니다.' });

    const { data: pref } = await admin.from('user_notification_event_prefs')
      .select('enabled').eq('user_id', userId).eq('event_key', eventKey).maybeSingle();
    if (pref && pref.enabled === false) return json({ message: '수신자가 이 상황의 알림을 꺼두었습니다.' });

    const { data: tpl } = await admin.from('notification_templates').select('*').eq('event_key', eventKey).eq('active', true).maybeSingle();
    if (!tpl) return json({ message: '활성 템플릿이 없습니다.' });

    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId);
    if (!subs?.length) return json({ message: '등록된 기기가 없습니다.' });

    webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

    const title = fillTemplate(tpl.title_template, vars);
    const body = fillTemplate(tpl.body_template, vars);

    const results = await Promise.all(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, link: link || undefined, tag: eventKey }),
        );
        return { endpoint: s.endpoint, ok: true };
      } catch (e: any) {
        const status = e?.statusCode;
        if (status === 404 || status === 410) {
          // 만료/해지된 구독은 정리한다.
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
        return { endpoint: s.endpoint, ok: false, status };
      }
    }));

    return json({ results });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
