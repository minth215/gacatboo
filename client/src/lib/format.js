export const fmtWon = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

export const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR');

// 외화 금액 표시: 정수면 소수점 없이, 소수가 있으면 둘째 자리까지 + 통화 코드(예: "19.99 USD")
export const fmtForeign = (n, code) => {
  const v = Number(n || 0);
  const formatted = Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${code}`;
};

// YYYY-MM-DD → YYYY.MM.DD
export const dotDate = (d) => (d ? d.replace(/-/g, '.') : '');

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

// 월 구분 배지 표기: "2026 년 9 월" (의존명사 띄어쓰기)
export function monthPillLabel(month) {
  const [y, m] = month.split('-');
  return `${y} 년 ${Number(m)} 월`;
}

// ---------- 통계 기간(주/월/연/기간 선택) ----------
// 날짜(YYYY-MM-DD)에 일수를 더한 날짜
export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// 그 날짜가 속한 주의 시작(일요일)
export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return shiftDate(dateStr, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export const currentYear = () => String(new Date().getFullYear());

// 기간 모드별 조회 범위 { start, endExclusive }
// anchor: week='YYYY-MM-DD'(주 시작) | month='YYYY-MM' | year='YYYY' | range={ from, to }
export function periodBounds(mode, anchor) {
  if (mode === 'week') return { start: anchor, endExclusive: shiftDate(anchor, 7) };
  if (mode === 'year') return { start: `${anchor}-01-01`, endExclusive: `${Number(anchor) + 1}-01-01` };
  if (mode === 'range') return { start: anchor.from, endExclusive: shiftDate(anchor.to, 1) };
  return { start: `${anchor}-01`, endExclusive: `${shiftMonth(anchor, 1)}-01` };
}

export function periodLabel(mode, anchor) {
  if (mode === 'week') {
    const day = (s) => { const [, m, d] = s.split('-').map(Number); return `${m} 월 ${d} 일`; };
    return `${day(anchor)} ~ ${day(shiftDate(anchor, 6))}`;
  }
  if (mode === 'year') return `${anchor} 년`;
  if (mode === 'range') return `${dotDate(anchor.from)} ~ ${dotDate(anchor.to)}`;
  return monthPillLabel(anchor);
}

// 이전/다음 기간으로 이동한 anchor
export function shiftPeriod(mode, anchor, delta) {
  if (mode === 'week') return shiftDate(anchor, delta * 7);
  if (mode === 'year') return String(Number(anchor) + delta);
  return shiftMonth(anchor, delta);
}

// 꺾은선 그래프용 눈금 라벨(짧게)
export function periodTickLabel(mode, anchor) {
  if (mode === 'week') { const [, m, d] = anchor.split('-').map(Number); return `${m}/${d}`; }
  if (mode === 'year') return `${anchor}년`;
  return `${Number(anchor.split('-')[1])}월`;
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

// "내용" 기본값 템플릿의 날짜 변수 치환: {연}/{월}/{일} (날짜: YYYY-MM-DD)
export function renderTemplate(template, dateStr) {
  if (!template) return '';
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  return template
    .split('{연}').join(y ? String(y) : '')
    .split('{월}').join(m ? String(m) : '')
    .split('{일}').join(d ? String(d) : '');
}

// 그룹 유형(카테고리)에 따른 리더 명칭 / 구독형 여부
export const isSubscription = (category) => category === '구독';
export const isSettlement = (category) => category === '정산';
export const leaderLabel = (category) => (isSubscription(category) ? '총대' : '총무');
