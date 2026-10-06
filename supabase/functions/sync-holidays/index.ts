// 한국 공휴일 자동 동기화 Edge Function — Nager.Date(무료 공개 API, 키 불필요)에서
// 올해부터 2년 뒤까지의 공휴일을 받아와 public.kr_holidays 에 채워 넣는다(이미 있는
// 날짜는 건드리지 않음 — 0033/0042 에서 수동으로 다듬어 둔 라벨을 덮어쓰지 않기 위해).
// 배포: supabase functions deploy sync-holidays
// 호출: pg_cron(0043 마이그레이션)이 매달 1일 service_role 키로 자동 호출.
//       수동 테스트: supabase.functions.invoke('sync-holidays', { body: { years: [2027] } })

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

  let years: number[] = [];
  try {
    const payload = await req.json();
    if (Array.isArray(payload?.years)) years = payload.years;
  } catch { /* 본문 없이 호출(cron)되는 경우도 정상 */ }
  if (!years.length) {
    const thisYear = new Date().getUTCFullYear();
    years = [thisYear, thisYear + 1, thisYear + 2]; // 올해~2년 뒤까지 넉넉히
  }

  const rows: { date: string; name: string }[] = [];
  const errors: string[] = [];
  for (const year of years) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
      if (!res.ok) { errors.push(`${year}년 조회 실패(${res.status})`); continue; }
      const list = await res.json();
      for (const h of list) {
        if (!h?.date) continue;
        rows.push({ date: h.date, name: h.localName || h.name || '공휴일' });
      }
    } catch (e) {
      errors.push(`${year}년 조회 오류: ${String((e as Error).message ?? e)}`);
    }
  }

  if (!rows.length) return json({ error: '받아온 공휴일이 없습니다.', errors }, 502);

  // 이미 있는 날짜(수동으로 다듬어 둔 라벨 포함)는 그대로 두고, 없는 날짜만 채운다.
  const { error: upErr } = await admin.from('kr_holidays').upsert(rows, { onConflict: 'date', ignoreDuplicates: true });
  if (upErr) return json({ error: upErr.message, errors }, 500);

  return json({ message: `${rows.length}건 동기화 완료(${years.join(', ')}년)`, errors: errors.length ? errors : undefined });
});
