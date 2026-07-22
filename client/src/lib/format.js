export const fmtWon = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

export const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR');

// 현재 월(YYYY-MM)
export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 오늘(YYYY-MM-DD)
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 월 이동: 'YYYY-MM' + delta개월
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월`;
}

// 날짜(YYYY-MM-DD)에 주기(unit,count) * n 을 더한 날짜 문자열
export function addInterval(dateStr, unit, count, n = 1) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const step = (count || 1) * n;
  if (unit === 'day') dt.setUTCDate(dt.getUTCDate() + step);
  else if (unit === 'week') dt.setUTCDate(dt.getUTCDate() + step * 7);
  else if (unit === 'year') dt.setUTCFullYear(dt.getUTCFullYear() + step);
  else dt.setUTCMonth(dt.getUTCMonth() + step); // month 기본
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export const PERIOD_LABEL = { day: '일', week: '주', month: '개월', year: '년' };

// 그룹 유형(카테고리)에 따른 리더 명칭 / 구독형 여부
export const isSubscription = (category) => category === '구독';
export const leaderLabel = (category) => (isSubscription(category) ? '총대' : '총무');
