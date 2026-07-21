// 관리자 전용 Edge Function — service_role 이 필요한 계정 생성/삭제 처리.
// 배포: supabase functions deploy admin
// 호출: supabase.functions.invoke('admin', { body: { action, ... } })
//
// service_role 키는 Edge Function 런타임에서 SUPABASE_SERVICE_ROLE_KEY 로 자동 주입됩니다.
// (절대 클라이언트에 노출하지 마세요.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 호출자 인증 확인
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: '인증이 필요합니다.' }, 401);

  // 호출자가 관리자인지 확인
  const { data: me } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
  if (me?.role !== 'admin') return json({ error: '관리자 권한이 필요합니다.' }, 403);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400);
  }
  const { action } = payload;

  try {
    if (action === 'create_user') {
      const { email, password, username, display_name, role } = payload;
      if (!email || !password || !username || !display_name) {
        return json({ error: '이메일, 비밀번호, 아이디, 이름을 모두 입력하세요.' }, 400);
      }
      // 트리거가 프로필을 pending/user 로 생성하므로, 생성 후 승인/역할 반영.
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name },
      });
      if (cErr) return json({ error: cErr.message }, 400);

      const newId = created.user!.id;
      await admin.from('profiles')
        .update({ status: 'approved', role: role === 'admin' ? 'admin' : 'user', username, display_name })
        .eq('id', newId);
      return json({ message: '계정이 생성되었습니다.', id: newId });
    }

    if (action === 'delete_user') {
      const { id } = payload;
      if (!id) return json({ error: '대상이 필요합니다.' }, 400);
      if (id === userData.user.id) return json({ error: '본인 계정은 삭제할 수 없습니다.' }, 400);
      const { error: dErr } = await admin.auth.admin.deleteUser(id); // profiles 는 on delete cascade
      if (dErr) return json({ error: dErr.message }, 400);
      return json({ message: '계정이 삭제되었습니다.' });
    }

    return json({ error: '알 수 없는 작업입니다.' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
