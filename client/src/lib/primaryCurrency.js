import { useSyncExternalStore } from 'react';
import { fetchKrwRate } from './currency.js';

// 주 화폐(설정 > 화폐 설정). 기록 금액은 원화(amount)로 저장되고, 주 화폐가 원화가 아니면
// 합계·통계 금액을 현재 환율로 환산해 보여준다. rate = 1 주 화폐당 원화.
let state = { code: 'KRW', rate: 1 };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const getPrimary = () => state;
export function usePrimaryCurrency() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getPrimary);
}
// 주 화폐 적용(환율은 비동기로 받아온 뒤 반영 — 받기 전엔 이전 값 유지)
export async function applyPrimaryCurrency(code) {
  const c = code || 'KRW';
  if (c === 'KRW') { state = { code: 'KRW', rate: 1 }; emit(); return; }
  try {
    const rate = await fetchKrwRate(c);
    state = { code: c, rate }; emit();
  } catch {
    // 환율을 못 받으면 원화로 표시(잘못된 환산 방지)
    state = { code: 'KRW', rate: 1 }; emit();
  }
}

// 원화 금액 → 주 화폐 금액
export const toPrimary = (krw) => (state.code === 'KRW' ? Number(krw || 0) : Number(krw || 0) / state.rate);
// 합계 표시(단위 없이). 원화는 정수, 다른 화폐는 소수 둘째 자리까지
export const fmtP = (krw) => {
  const v = toPrimary(krw);
  return state.code === 'KRW'
    ? Math.round(v).toLocaleString('ko-KR')
    : v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
// 단위 포함 표시(원화는 "N원", 다른 화폐는 "N USD")
export const fmtPUnit = (krw) => (state.code === 'KRW' ? `${fmtP(krw)}원` : `${fmtP(krw)} ${state.code}`);
