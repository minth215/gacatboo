// 링크 미리보기: 상품 페이지 등 URL 의 대표 이미지(og:image)와 제목(og:title/<title>)을 가져오는 Edge Function.
// 브라우저에서는 다른 사이트 HTML 을 직접 읽을 수 없어(CORS) 서버에서 대신 읽는다.
// 배포: supabase functions deploy link-preview
// 호출: supabase.functions.invoke('link-preview', { body: { url } }) → { image, title }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

// <meta property="og:image" content="..."> (속성 순서 무관)
function metaContent(html: string, keys: string[]): string {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const key of keys) {
    for (const tag of tags) {
      const name = tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (name !== key) continue;
      const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
      if (content) return decode(content.trim());
    }
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 로그인한 사용자만(남이 프록시처럼 쓰지 못하게)
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u } = await supa.auth.getUser();
  if (!u?.user) return json({ error: '인증이 필요합니다.' }, 401);

  let target: URL;
  try {
    const { url } = await req.json();
    target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error();
  } catch { return json({ error: '올바른 URL 이 아닙니다.' }, 400); }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(target, {
      signal: ctrl.signal, redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GacatbooLinkPreview/1.0; +https://minth215.github.io/gacatboo/)',
        'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko,en;q=0.8',
      },
    });
    clearTimeout(timer);
    // 앞부분(최대 1MB)만 읽음 — 메타 태그는 <head> 에 있음
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      while (size < 1_000_000) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        html += dec.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    }
    const base = res.url || target.toString();
    let image = metaContent(html, ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'image']);
    if (image) { try { image = new URL(image, base).toString(); } catch { image = ''; } }
    const title = metaContent(html, ['og:title', 'twitter:title'])
      || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '');
    return json({ image, title });
  } catch {
    return json({ image: '', title: '' });
  }
});
