// 반복으로 자동 기록된 보조 화폐 항목의 원화 금액을 "그날의 환율"로 다시 계산하는 Edge Function.
// 매일 자동 기록(generate_due_recurring_transactions, 0065)이 끝난 뒤 DB 가 service_role 키로 호출한다.
// 배포: supabase functions deploy recurring-fx
// 환율: 앱과 같은 Frankfurter(ECB 공시, 영업일 하루 1회 갱신 — 주말·공휴일엔 직전 영업일 환율).
//
// 대상(그날 날짜 + 반복으로 생성 + 보조 화폐로 입력된 것):
//   · 그룹 결제(subscription_payments)·입금(subscription_deposits): 원본 행을 고치면 동기화 트리거가
//     개인 가계부의 미러 거래에도 그대로 반영한다.
//   · 개인/그룹 일반 기록(transactions, 미러가 아닌 것): 항목(items)별 화폐 정보가 있으면 항목마다
//     다시 계산해 합계를 맞추고, 없으면 기록 단위 금액만 다시 계산한다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token || token !== serviceKey) return json({ error: '권한이 없습니다.' }, 401);

  let date = kstToday();
  try {
    const payload = await req.json();
    if (typeof payload?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)) date = payload.date;
  } catch { /* 본문 없이 호출돼도 오늘 날짜로 처리 */ }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const rates: Record<string, number | null> = {};
  const rateOf = async (code: string) => {
    if (!code || code === 'KRW') return 1;
    if (code in rates) return rates[code];
    try {
      const res = await fetch(`https://api.frankfurter.dev/v2/rate/${code}/KRW`);
      const data = res.ok ? await res.json() : null;
      const r = Number(data?.rate);
      rates[code] = Number.isFinite(r) && r > 0 ? r : null;
    } catch {
      rates[code] = null;
    }
    return rates[code];
  };

  const result = { date, payments: 0, deposits: 0, transactions: 0, skipped: 0 };

  // 그룹 결제 · 입금
  for (const table of ['subscription_payments', 'subscription_deposits'] as const) {
    const { data: rows } = await admin.from(table).select('id, input_currency, input_amount')
      .eq('date', date).not('recurring_id', 'is', null).neq('input_currency', '');
    for (const r of rows ?? []) {
      const rate = await rateOf(r.input_currency);
      if (!rate || r.input_amount == null) { result.skipped++; continue; }
      await admin.from(table).update({ amount: Math.round(Number(r.input_amount) * rate), fx_rate: rate }).eq('id', r.id);
      if (table === 'subscription_payments') result.payments++; else result.deposits++;
    }
  }

  // 일반 기록(그룹 결제/입금 미러는 위에서 트리거로 처리되므로 제외)
  const { data: txs } = await admin.from('transactions').select('id, input_currency, input_amount, items')
    .eq('date', date).not('recurring_id', 'is', null).is('origin_type', null).neq('input_currency', '');
  for (const t of txs ?? []) {
    const rate = await rateOf(t.input_currency);
    if (!rate) { result.skipped++; continue; }
    const items = Array.isArray(t.items) ? t.items : null;
    const hasItemFx = items?.some((it: any) => it?.input_currency);
    if (items && hasItemFx) {
      let ok = true;
      const next = [];
      for (const it of items) {
        if (it?.input_currency && it.input_amount != null) {
          const r = await rateOf(it.input_currency);
          if (!r) { ok = false; break; }
          next.push({ ...it, amount: Math.round(Number(it.input_amount) * r), fx_rate: r });
        } else next.push(it);
      }
      if (!ok) { result.skipped++; continue; }
      const total = next.reduce((s: number, it: any) => s + (Number(it?.amount) || 0) * (Number(it?.qty) || 1), 0);
      await admin.from('transactions').update({ items: next, amount: total, fx_rate: rate }).eq('id', t.id);
    } else {
      if (t.input_amount == null) { result.skipped++; continue; }
      await admin.from('transactions').update({ amount: Math.round(Number(t.input_amount) * rate), fx_rate: rate }).eq('id', t.id);
    }
    result.transactions++;
  }

  return json(result);
});
