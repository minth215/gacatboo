// 영수증 사진에서 날짜/금액/상호명/분류를 추출하는 Edge Function (Google Gemini Vision API 사용)
// 배포: supabase functions deploy parse-receipt
// 호출: supabase.functions.invoke('parse-receipt', { body: { image, mimeType, categoryNames } })
//
// 시크릿 설정 필요(Supabase 대시보드 > Edge Functions > Secrets, 또는 CLI):
//   supabase secrets set GEMINI_API_KEY=발급받은_API_키
// (선택) GEMINI_MODEL 로 모델을 바꿀 수 있습니다. 기본값: gemini-3.8-flash

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
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: '서버에 GEMINI_API_KEY 가 설정되지 않았습니다.' }, 500);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 호출자 인증 확인(로그인한 사용자만 사용 가능 — 외부에서 API 키를 도용해 무제한 호출하는 것을 방지)
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: '인증이 필요합니다.' }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400);
  }
  const { image, mimeType, categoryNames } = payload;
  if (!image || !mimeType) return json({ error: '이미지가 필요합니다.' }, 400);

  const catList: string[] = Array.isArray(categoryNames)
    ? categoryNames.filter((n) => typeof n === 'string' && n.trim())
    : [];

  const prompt = `당신은 영수증 이미지에서 정보를 추출하는 도우미입니다. 첨부된 영수증 사진을 보고 아래 JSON 형식으로만 답하세요. 다른 설명 없이 JSON 객체 하나만 반환하세요.

{
  "date": "결제 날짜(YYYY-MM-DD 형식). 확인할 수 없으면 null",
  "amount": 실제 결제된 최종 합계 금액(대한민국 원화 정수, 콤마 없이 숫자만). 확인할 수 없으면 null,
  "merchant": "상호명 또는 가게 이름. 확인할 수 없으면 null",
  "category": ${catList.length
    ? `"다음 목록 중 이 영수증에 가장 어울리는 것을 목록에 있는 문자열 그대로 하나만 반환하세요. 어울리는 것이 없으면 null. 목록: ${catList.join(', ')}"`
    : 'null'}
}`;

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: image } }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      return json({ error: result?.error?.message || 'Gemini 호출에 실패했습니다.' }, 502);
    }
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: '영수증에서 정보를 추출하지 못했습니다.' }, 502);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return json({ error: '응답을 해석하지 못했습니다.' }, 502);
      parsed = JSON.parse(match[0]);
    }

    const amount = Number(parsed.amount);
    return json({
      date: typeof parsed.date === 'string' ? parsed.date : null,
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null,
      merchant: typeof parsed.merchant === 'string' ? parsed.merchant : null,
      category: typeof parsed.category === 'string' && catList.includes(parsed.category) ? parsed.category : null,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
