import { useState } from 'react';
import { RECURRENCE_PRESETS, WEEKDAY_LABELS } from '../lib/recurrence.js';

// "반복 기간 선택" 모달. 프리셋을 고르면 바로 onSelect({ preset }), "사용자화"를 고르면
// 추가 폼(횟수+단위, 단위가 "주"면 요일 다중선택)을 보여주고 확인 시 onSelect({ preset:'custom', interval, unit, weekdays }).
export default function RecurrenceModal({ onClose, onSelect }) {
  const [custom, setCustom] = useState(false);
  const [interval, setIntervalVal] = useState('1');
  const [unit, setUnit] = useState('month');
  const [weekdays, setWeekdays] = useState([]);

  const toggleWeekday = (i) => setWeekdays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()));

  const saveCustom = () => {
    const n = Math.max(1, Number(interval) || 1);
    onSelect({ preset: 'custom', interval: n, unit, weekdays });
  };

  return (
    <div className="catmodal-overlay" onClick={onClose}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>반복 기간 선택</div>
          <button aria-label="닫기" onClick={onClose} className="catmodal-icon-btn">
            <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
        </div>

        {!custom ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {RECURRENCE_PRESETS.map((p) => (
              <button
                key={p.key} type="button"
                onClick={() => (p.key === 'custom' ? setCustom(true) : onSelect({ preset: p.key }))}
                style={{ padding: '12px 4px', borderRadius: 12, border: '1.5px solid #e4e2e6', background: '#fff', fontSize: 12.75, fontWeight: 700, color: '#191722', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="grid2">
              <div className="field" style={{ margin: 0 }}>
                <input type="number" min="1" value={interval} onChange={(e) => setIntervalVal(e.target.value)} autoFocus />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="day">일마다</option>
                  <option value="week">주마다</option>
                  <option value="month">개월마다</option>
                  <option value="year">년마다</option>
                </select>
              </div>
            </div>

            {unit === 'week' && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', margin: '2px 0 14px' }}>
                {WEEKDAY_LABELS.map((w, i) => (
                  <button
                    key={i} type="button" onClick={() => toggleWeekday(i)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', border: 'none', flex: 'none',
                      background: weekdays.includes(i) ? '#191722' : '#f4f2f0',
                      color: weekdays.includes(i) ? '#fff' : '#191722', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setCustom(false)}>뒤로</button>
              <button type="button" className="btn-ink-pill" style={{ flex: 1, marginTop: 0 }} onClick={saveCustom}>확인</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
