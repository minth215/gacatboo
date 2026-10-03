// 반복 설정 공용 로직. 모든 패턴은 결국 { freq_unit: 'day'|'week'|'month'|'year', freq_interval: N,
// weekdays: number[](freq_unit='week'일 때만, 0=일~6=토) } 로 환원된다. 프리셋은 "반복 기간 선택"
// 모달에서 고르는 값이고, 실제 freq_unit/freq_interval/weekdays 계산은 사용자가 최종적으로 선택한
// 날짜(기록 페이지의 "날짜" 필드)가 확정된 뒤에 한다(매주/격주는 그 날짜의 요일을 기준으로 반복).

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export const RECURRENCE_PRESETS = [
  { key: 'daily', label: '매일' },
  { key: 'weekday', label: '평일' },
  { key: 'weekend', label: '주말' },
  { key: 'weekly', label: '매주' },
  { key: 'biweekly', label: '격주' },
  { key: 'monthly', label: '매월' },
  { key: 'every2m', label: '2개월마다' },
  { key: 'every3m', label: '3개월마다' },
  { key: 'every6m', label: '6개월마다' },
  { key: 'yearly', label: '매년' },
  { key: 'custom', label: '사용자화' },
];

// 'YYYY-MM-DD' → 요일(0=일~6=토). 로컬 타임존 기준으로 안전하게 파싱(UTC 파싱 시 발생할 수 있는
// 날짜 밀림 방지를 위해 new Date(y, m-1, d) 생성자 사용).
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

const UNIT_LABEL = { day: '일', week: '주', month: '개월', year: '년' };

// pending: 모달에서 고른 선택값. { preset } 또는 사용자화의 경우 { preset: 'custom', interval, unit, weekdays }
// dateStr: 기록 페이지에 최종 입력된 날짜('YYYY-MM-DD') — 매주/격주의 기준 요일 계산에 사용.
export function resolveRecurrence(pending, dateStr) {
  if (!pending) return null;
  const dow = weekdayOf(dateStr);
  switch (pending.preset) {
    case 'daily': return { freq_unit: 'day', freq_interval: 1, weekdays: [], label: '매일' };
    case 'weekday': return { freq_unit: 'week', freq_interval: 1, weekdays: [1, 2, 3, 4, 5], label: '평일' };
    case 'weekend': return { freq_unit: 'week', freq_interval: 1, weekdays: [0, 6], label: '주말' };
    case 'weekly': return { freq_unit: 'week', freq_interval: 1, weekdays: [dow], label: '매주' };
    case 'biweekly': return { freq_unit: 'week', freq_interval: 2, weekdays: [dow], label: '격주' };
    case 'monthly': return { freq_unit: 'month', freq_interval: 1, weekdays: [], label: '매월' };
    case 'every2m': return { freq_unit: 'month', freq_interval: 2, weekdays: [], label: '2개월마다' };
    case 'every3m': return { freq_unit: 'month', freq_interval: 3, weekdays: [], label: '3개월마다' };
    case 'every6m': return { freq_unit: 'month', freq_interval: 6, weekdays: [], label: '6개월마다' };
    case 'yearly': return { freq_unit: 'year', freq_interval: 1, weekdays: [], label: '매년' };
    case 'custom': {
      const weekdays = pending.unit === 'week' ? (pending.weekdays?.length ? pending.weekdays : [dow]) : [];
      const weekdayPart = pending.unit === 'week' ? ` (${weekdays.map((w) => WEEKDAY_LABELS[w]).join(',')})` : '';
      return { freq_unit: pending.unit, freq_interval: pending.interval, weekdays, label: `${pending.interval}${UNIT_LABEL[pending.unit]}마다${weekdayPart}` };
    }
    default: return null;
  }
}

// 어떤 날짜(d, Date 객체)가 이 패턴(freq_unit/freq_interval/weekdays, start 기준)에 해당하는
// "반복일"인지 — 서버의 generate_recurring_occurrence() SQL 로직과 동일하게 맞춤(월말 보정 포함).
function isDueOn(d, start, unit, interval, weekdays) {
  const MS_DAY = 86400000;
  if (unit === 'day') {
    const days = Math.round((d - start) / MS_DAY);
    return days % interval === 0;
  }
  if (unit === 'week') {
    const startWeekStart = new Date(start); startWeekStart.setDate(start.getDate() - start.getDay());
    const dWeekStart = new Date(d); dWeekStart.setDate(d.getDate() - d.getDay());
    const weeks = Math.round((dWeekStart - startWeekStart) / (7 * MS_DAY));
    return weeks % interval === 0 && (weekdays || []).includes(d.getDay());
  }
  if (unit === 'month') {
    const monthsSince = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
    const lastDayOfDMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(start.getDate(), lastDayOfDMonth);
    return monthsSince >= 0 && monthsSince % interval === 0 && d.getDate() === targetDay;
  }
  // year
  const yearsSince = d.getFullYear() - start.getFullYear();
  const lastDayOfThatMonth = new Date(d.getFullYear(), start.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(start.getDate(), lastDayOfThatMonth);
  return yearsSince >= 0 && yearsSince % interval === 0 && d.getMonth() === start.getMonth() && d.getDate() === targetDay;
}

// 과거 날짜로 반복을 새로 걸 때, "시작일 다음날 ~ throughDateStr" 사이에 이 패턴대로라면
// 이미 생성됐어야 할 날짜가 몇 개인지 미리 센다(일괄 생성 여부를 물을 때 보여줄 개수).
export function countDueDates(rule, startDateStr, throughDateStr) {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const [ty, tm, td] = throughDateStr.split('-').map(Number);
  const through = new Date(ty, tm - 1, td);
  if (through <= start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= through) {
    if (isDueOn(cur, start, rule.freq_unit, rule.freq_interval, rule.weekdays)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// 저장된 규칙(freq_unit/freq_interval/weekdays)을 사람이 읽을 라벨로(반복 관리 목록 등에서 label 이
// 없는 경우의 대체용 — 보통은 규칙 생성 시 넣어둔 label 을 그대로 쓰면 된다).
export function describeRule(rule) {
  if (rule.label) return rule.label;
  if (rule.freq_unit === 'week' && rule.weekdays?.length) {
    return `${rule.freq_interval > 1 ? `${rule.freq_interval}주마다` : '매주'} (${rule.weekdays.map((w) => WEEKDAY_LABELS[w]).join(',')})`;
  }
  return `${rule.freq_interval}${UNIT_LABEL[rule.freq_unit]}마다`;
}

export const BUSINESS_DAY_LABELS = { none: '없음', before: '전 영업일', after: '후 영업일' };

// 반복 상세 화면용: 시작일에서 뽑아낸 실제 일자(월/연 반복일 때)까지 포함한 사람이 읽는 주기 설명.
// 예: 매월(간격1) → "매월 1 일", 매년(간격1) → "매년 1 월 1 일", 3개월마다 → "3개월마다 1 일".
// 영업일 보정이 설정돼 있으면 뒤에 괄호로 덧붙인다(예: "매월 25 일 (전 영업일)").
export function periodDetailLabel(rule) {
  if (rule.freq_unit === 'month' || rule.freq_unit === 'year') {
    const d = new Date(`${rule.start_date}T00:00:00`);
    const day = d.getDate();
    const base = rule.freq_unit === 'month'
      ? (rule.freq_interval > 1 ? `${rule.freq_interval}개월마다 ${day} 일` : `매월 ${day} 일`)
      : (() => {
        const month = d.getMonth() + 1;
        return rule.freq_interval > 1 ? `${rule.freq_interval}년마다 ${month} 월 ${day} 일` : `매년 ${month} 월 ${day} 일`;
      })();
    return rule.business_day_rule && rule.business_day_rule !== 'none'
      ? `${base} (${BUSINESS_DAY_LABELS[rule.business_day_rule]})` : base;
  }
  return describeRule(rule);
}
