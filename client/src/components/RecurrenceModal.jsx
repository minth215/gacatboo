import { useState } from 'react';
import { RECURRENCE_PRESETS, WEEKDAY_LABELS, BUSINESS_DAY_LABELS } from '../lib/recurrence.js';
import BareSelect from './BareSelect.jsx';

// 프리셋별 실제 반복 단위(영업일 처리는 월/연 반복에만 의미가 있음)
const PRESET_UNIT = {
  daily: 'day', weekday: 'week', weekend: 'week', weekly: 'week', biweekly: 'week',
  monthly: 'month', every2m: 'month', every3m: 'month', every6m: 'month', yearly: 'year',
};
const PRESET_OPTIONS = RECURRENCE_PRESETS.map((p) => [p.key, p.label]);
const UNIT_OPTIONS = [['day', '일마다'], ['week', '주마다'], ['month', '개월마다'], ['year', '년마다']];

const weekdayOf = (dateStr) => {
  if (!dateStr) return new Date().getDay();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

// 테두리 없는 숫자 입력
function BareNumber({ value, onChange }) {
  return (
    <input
      type="text" inputMode="numeric" value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      style={{ width: 26, border: 'none', outline: 'none', background: 'transparent', padding: 0, margin: 0, fontFamily: 'inherit', fontSize: 13.25, color: 'var(--k-tx-191722)', textAlign: 'right' }}
    />
  );
}

// "반복 등록" 모달(기록/기록 수정 화면의 반복 아이콘). 반복 상세 모달과 같은 셀렉트 방식:
// 반복 주기 셀렉트 → 매주/격주·사용자화(주)는 요일 여러 개 선택, 사용자화는 횟수 + 단위,
// 월/연 반복은 영업일 처리 셀렉트. 확인 시
//   onSelect({ preset, weekdays?, business_day_rule }) 또는
//   onSelect({ preset:'custom', interval, unit, weekdays, business_day_rule }).
// date: 기록 페이지의 날짜(매주/격주 기본 요일 계산용, 없으면 오늘).
export default function RecurrenceModal({ onClose, onSelect, date }) {
  const dow = weekdayOf(date);
  const [preset, setPreset] = useState('monthly');
  const [interval, setIntervalVal] = useState('1');
  const [unit, setUnit] = useState('month');
  const [weekdays, setWeekdays] = useState([dow]);
  const [businessDayRule, setBusinessDayRule] = useState('none');
  // 반복 날짜(월 반복의 일자, 연 반복의 월·일): 기본은 기록 날짜. 바꿔도 기록 날짜는 그대로이고
  // 반복 규칙의 기준일만 바뀐다.
  const [dm, dd] = (date || '').split('-').slice(1).map(Number);
  const [day, setDay] = useState(String(dd || new Date().getDate()));
  const [month, setMonth] = useState(String(dm || new Date().getMonth() + 1));

  const effectiveUnit = preset === 'custom' ? unit : PRESET_UNIT[preset];
  const showWeekdays = preset === 'weekly' || preset === 'biweekly' || (preset === 'custom' && unit === 'week');
  const showBusinessDay = effectiveUnit === 'month' || effectiveUnit === 'year';

  const toggleWeekday = (i) => setWeekdays((prev) => {
    const next = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort();
    return next.length ? next : prev; // 최소 한 요일은 남김
  });

  const confirm = () => {
    const bdr = showBusinessDay ? businessDayRule : 'none';
    const clamp = (v, max) => String(Math.min(max, Math.max(1, Number(v) || 1)));
    const datePart = effectiveUnit === 'month' ? { day: clamp(day, 31) }
      : effectiveUnit === 'year' ? { month: clamp(month, 12), day: clamp(day, 31) } : {};
    if (preset === 'custom') {
      onSelect({ preset: 'custom', interval: Math.max(1, Number(interval) || 1), unit, weekdays: unit === 'week' ? weekdays : [], business_day_rule: bdr, ...datePart });
    } else {
      onSelect({ preset, ...(showWeekdays ? { weekdays } : {}), business_day_rule: bdr, ...datePart });
    }
  };

  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 };
  const labelStyle = { fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)', flex: 'none', whiteSpace: 'nowrap' };

  return (
    <div className="catmodal-overlay" onClick={onClose}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>반복 등록</div>
          <button aria-label="닫기" onClick={onClose} className="catmodal-icon-btn">
            <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={rowStyle}>
            <span style={labelStyle}>반복 주기</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <BareSelect value={preset} options={PRESET_OPTIONS} onChange={setPreset} />
              {preset === 'custom' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <BareNumber value={interval} onChange={setIntervalVal} />
                  <BareSelect value={unit} options={UNIT_OPTIONS} onChange={setUnit} />
                </span>
              )}
              {effectiveUnit === 'month' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <BareNumber value={day} onChange={setDay} />
                  <span style={{ fontSize: 13.25, color: 'var(--k-tx-191722)' }}>일</span>
                </span>
              )}
              {effectiveUnit === 'year' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <BareNumber value={month} onChange={setMonth} />
                  <span style={{ fontSize: 13.25, color: 'var(--k-tx-191722)' }}>월</span>
                  <BareNumber value={day} onChange={setDay} />
                  <span style={{ fontSize: 13.25, color: 'var(--k-tx-191722)' }}>일</span>
                </span>
              )}
            </span>
          </div>

          {showWeekdays && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {WEEKDAY_LABELS.map((w, i) => {
                const on = weekdays.includes(i);
                return (
                  <button
                    key={i} type="button" onClick={() => toggleWeekday(i)}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flex: 'none', background: on ? 'var(--k-bg-191722)' : 'var(--k-bg-f4f2f0)', color: on ? 'var(--k-onink-fff)' : 'var(--k-tx-191722)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >{w}</button>
                );
              })}
            </div>
          )}

          {showBusinessDay && (
            <div style={rowStyle}>
              <span style={labelStyle}>영업일 처리</span>
              <BareSelect value={businessDayRule} options={Object.entries(BUSINESS_DAY_LABELS)} onChange={setBusinessDayRule} />
            </div>
          )}
        </div>

        <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} onClick={confirm}>확인</button>
      </div>
    </div>
  );
}
