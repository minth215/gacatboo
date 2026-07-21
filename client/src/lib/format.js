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
