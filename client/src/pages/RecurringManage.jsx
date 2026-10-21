import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, fmtForeign, dotDate } from '../lib/format.js';
import { describeRule, periodDetailLabel, BUSINESS_DAY_LABELS, RECURRENCE_PRESETS, WEEKDAY_LABELS, resolveRecurrence } from '../lib/recurrence.js';
import PageHeader from '../components/PageHeader.jsx';
import RecurrenceModal from '../components/RecurrenceModal.jsx';
import { DayCardRow } from '../components/TransactionList.jsx';

// 입금 반복은 총대(수입)/멤버(지출) 두 관점이 공존 — 지금 보는 사람이 총대인지에 따라 표시 전환
function viewOf(r, userId) {
  const isOwnerView = r.target === 'subscription_deposit' && r.group?.owner_id === userId;
  const dispType = r.target === 'subscription_deposit' ? (isOwnerView ? 'income' : 'expense') : r.type;
  const dispName = isOwnerView ? r.leader_category_name : r.category_name;
  const dispEmoji = isOwnerView ? r.leader_category_emoji : r.category_emoji;
  const dispSource = r.target === 'subscription_deposit' ? (isOwnerView ? r.deposit_source_name : r.source_name) : r.source_name;
  return { dispType, dispName, dispEmoji, dispSource };
}

export default function RecurringManage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null); // 스와이프로 열린 카드(한 번에 하나)

  const load = useCallback(() => db.listRecurringRules().then(setRules).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const del = async (r) => {
    if (!confirm(`'${r.content || r.category_name || describeRule(r)}' 반복을 해제할까요? (이미 기록된 내역은 그대로 남습니다)`)) return;
    try { await db.deleteRecurringRule(r.id); load(); } catch (e) { alert(e.message); }
  };

  const onSelectPeriod = (pending) => {
    setPicking(false);
    nav('/new', { state: { pendingRecurrence: pending } });
  };

  const openDetail = (r) => setDetail(r);
  const closeDetail = () => setDetail(null);

  const saveEndDate = async (value) => {
    if (!detail) return;
    setSaving(true);
    try {
      await db.updateRecurringRuleEndDate(detail.id, value || null);
      setRules((prev) => prev.map((x) => (x.id === detail.id ? { ...x, end_date: value || null } : x)));
      setDetail((d) => (d ? { ...d, end_date: value || null } : d));
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  // 반복 시작일/주기 등 여러 칸을 한 번에 저장(상세 모달에서 바로 반영)
  const saveRule = async (patch) => {
    if (!detail) return;
    setSaving(true);
    try {
      await db.updateRecurringRule(detail.id, patch);
      setRules((prev) => prev.map((x) => (x.id === detail.id ? { ...x, ...patch } : x)));
      setDetail((d) => (d ? { ...d, ...patch } : d));
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const saveBusinessDay = async (value) => {
    if (!detail || detail.business_day_rule === value) return;
    setSaving(true);
    try {
      await db.updateRecurringRuleBusinessDay(detail.id, value);
      setRules((prev) => prev.map((x) => (x.id === detail.id ? { ...x, business_day_rule: value } : x)));
      setDetail((d) => (d ? { ...d, business_day_rule: value } : d));
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="반복 관리" flat />

      {rules.length === 0 ? (
        <div className="empty empty-center">등록된 반복 항목이 없습니다.</div>
      ) : (
        rules.map((r, i) => {
          const { dispType, dispName, dispEmoji } = viewOf(r, user.id);
          return (
            <div key={r.id} className="tx-daygroup" style={{ marginTop: i === 0 ? 14 : 10 }}>
              <DayCardRow
                index={0} count={1} clickable
                isOpen={openId === r.id} onOpenChange={(open) => setOpenId(open ? r.id : null)}
                onTap={() => openDetail(r)} onDelete={() => del(r)}
                background={r.group_id ? 'linear-gradient(135deg, #FFF1F3 0%, #FFF6EA 100%)' : '#fff'}
              >
                <span className="tx-tile" style={{ background: r.category_color || (r.group_id ? 'rgba(255,255,255,.7)' : (dispType === 'income' ? '#E5FBF6' : dispType === 'transfer' ? '#EFEDF5' : '#FFE9EF')) }}>
                  {dispEmoji || (dispType === 'income' ? '💰' : dispType === 'transfer' ? '🔁' : '💸')}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tx-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ttext">{r.content || dispName || (dispType === 'income' ? '수입' : dispType === 'transfer' ? '이체' : '지출')}</span>
                  </div>
                  <div className="tx-row-sub">{periodDetailLabel(r)}</div>
                </div>
                {/* 보조 화폐로 입력한 반복이면 가계부 카드처럼 보조 화폐 금액 + 아래 작은 원화 금액 */}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 'none' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color: dispType === 'income' ? '#2CDDB9' : dispType === 'transfer' ? '#4b4752' : '#FF4358' }}>
                    {dispType === 'transfer' ? '' : (dispType === 'income' ? '+' : '-')}{r.input_currency ? fmtForeign(r.input_amount, r.input_currency) : fmtNum(r.amount)}
                  </span>
                  {r.input_currency && <span style={{ fontSize: 10.5, color: '#a29ead', marginTop: 1 }}>{dispType === 'transfer' ? '' : (dispType === 'income' ? '+' : '-')}{fmtNum(r.amount)} KRW</span>}
                </span>
              </DayCardRow>
            </div>
          );
        })
      )}

      <button className="fab" onClick={() => setPicking(true)} aria-label="반복 추가">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {picking && <RecurrenceModal onClose={() => setPicking(false)} onSelect={onSelectPeriod} />}

      {detail && (() => {
        const { dispType, dispName, dispEmoji, dispSource } = viewOf(detail, user.id);
        const sub = [dispName, dispSource].filter(Boolean).join(' · ') || '—';
        return (
          <div className="catmodal-overlay" onClick={closeDetail}>
            <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>반복 상세</div>
                <button aria-label="닫기" onClick={closeDetail} className="catmodal-icon-btn">
                  <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#faf9f8', borderRadius: 14, padding: '12px 14px' }}>
                <span className="tx-tile" style={{ background: detail.category_color || (dispType === 'income' ? '#E5FBF6' : dispType === 'transfer' ? '#EFEDF5' : '#FFE9EF') }}>
                  {dispEmoji || (dispType === 'income' ? '💰' : dispType === 'transfer' ? '🔁' : '💸')}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tx-row-title"><span className="ttext">{detail.content || dispName || (dispType === 'income' ? '수입' : dispType === 'transfer' ? '이체' : '지출')}</span></div>
                  <div className="tx-row-sub">{sub}</div>
                </div>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 'none' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color: dispType === 'income' ? 'var(--income)' : dispType === 'transfer' ? '#8b8798' : 'var(--expense)' }}>
                    {dispType === 'income' ? '+' : dispType === 'transfer' ? '' : '-'}{detail.input_currency ? fmtForeign(detail.input_amount, detail.input_currency) : fmtNum(detail.amount)}
                  </span>
                  {detail.input_currency && <span style={{ fontSize: 10.5, color: '#a29ead', marginTop: 1 }}>{dispType === 'income' ? '+' : dispType === 'transfer' ? '' : '-'}{fmtNum(detail.amount)} KRW</span>}
                </span>
              </div>

              <div style={{ height: 1, background: '#f0eee9' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>반복 시작일</span>
                  <BareDate value={detail.start_date} disabled={saving} onChange={(v) => v && saveRule({ start_date: v })} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#191722', flex: 'none' }}>반복 종료일</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {detail.end_date && (
                      <button type="button" onClick={() => saveEndDate('')} disabled={saving} className="edit-link" style={{ flex: 'none' }}>지우기</button>
                    )}
                    <BareDate value={detail.end_date || ''} placeholder="종료일 없음" min={detail.start_date} disabled={saving} onChange={(v) => v && saveEndDate(v)} />
                  </div>
                </div>

                <PeriodEditor rule={detail} disabled={saving} onSave={saveRule} />

                {(detail.freq_unit === 'month' || detail.freq_unit === 'year') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>영업일 처리</span>
                    <div style={{ display: 'flex', background: '#f4f2f0', borderRadius: 999, padding: 3 }}>
                      {Object.entries(BUSINESS_DAY_LABELS).map(([v, label]) => (
                        <button
                          key={v} type="button" disabled={saving} onClick={() => saveBusinessDay(v)}
                          style={{
                            flex: 1, border: 'none', borderRadius: 999, padding: '8px 0', fontFamily: 'inherit',
                            fontSize: 11.75, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                            background: (detail.business_day_rule || 'none') === v ? '#fff' : 'transparent',
                            color: (detail.business_day_rule || 'none') === v ? '#191722' : '#8b8798',
                          }}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 테두리 없는 날짜 편집: 보이는 글자(YYYY.MM.DD)는 직접 그리고, 투명한 date input 을 위에 덮어 탭만 받는다.
function BareDate({ value, onChange, placeholder = '', min, disabled }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ fontSize: 13.25, color: value ? '#191722' : '#b7b3bd', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{value ? dotDate(value) : placeholder}</span>
      <input
        type="date" value={value || ''} min={min || undefined} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
      />
    </span>
  );
}

// 테두리 없는 숫자 입력(포커스를 벗어나거나 엔터 시 저장)
function BareNumber({ value, min = 1, max, onCommit, disabled, width = 26 }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    let n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n < min) n = min;
    if (max != null && n > max) n = max;
    setDraft(String(n));
    if (n !== Number(value)) onCommit(n);
  };
  return (
    <input
      type="text" inputMode="numeric" value={draft} disabled={disabled}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={{ width, border: 'none', outline: 'none', background: 'transparent', padding: 0, margin: 0, fontFamily: 'inherit', fontSize: 13.25, color: '#191722', textAlign: 'right' }}
    />
  );
}

// 투명 select 를 덮은 "글자 + ▾" 선택(테두리 없음)
function BareSelect({ value, options, onChange, disabled }) {
  const label = options.find(([v]) => String(v) === String(value))?.[1] ?? '';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 13.25, color: '#191722', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{label}</span>
      <svg width="11" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
      <select
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, margin: 0, cursor: 'pointer' }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

const PRESET_OPTIONS = RECURRENCE_PRESETS.map((p) => [p.key, p.label]);
const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((w, i) => [i, `${w}요일`]);
const UNIT_OPTIONS = [['day', '일마다'], ['week', '주마다'], ['month', '개월마다'], ['year', '년마다']];

// 저장된 규칙이 어떤 프리셋에 해당하는지(맞는 게 없으면 사용자화)
function presetOf(r) {
  const wd = [...(r.weekdays || [])].sort().join(',');
  if (r.freq_unit === 'day' && r.freq_interval === 1) return 'daily';
  if (r.freq_unit === 'week' && r.freq_interval === 1 && wd === '1,2,3,4,5') return 'weekday';
  if (r.freq_unit === 'week' && r.freq_interval === 1 && wd === '0,6') return 'weekend';
  if (r.freq_unit === 'week' && (r.weekdays || []).length === 1) {
    if (r.freq_interval === 1) return 'weekly';
    if (r.freq_interval === 2) return 'biweekly';
  }
  if (r.freq_unit === 'month') {
    const m = { 1: 'monthly', 2: 'every2m', 3: 'every3m', 6: 'every6m' }[r.freq_interval];
    if (m) return m;
  }
  if (r.freq_unit === 'year' && r.freq_interval === 1) return 'yearly';
  return 'custom';
}

// 'YYYY-MM-DD' 의 일/월만 바꾼 날짜(그 달 말일을 넘지 않게 보정)
function withMonthDay(dateStr, month, day) {
  const [y, m] = dateStr.split('-').map(Number);
  const mm = month ?? m;
  const last = new Date(y, mm, 0).getDate();
  const dd = Math.min(Math.max(1, day), last);
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// 반복 주기 편집: 프리셋 셀렉트 + 그에 맞는 단위 표기(일/월·일/요일), 날짜 숫자는 테두리 없이 바로 수정.
// 일·월을 바꾸면 반복 기준이 되는 시작일의 일·월이 바뀐다(서버 자동 기록도 시작일 기준으로 계산).
export function PeriodEditor({ rule, disabled, onSave }) {
  const preset = presetOf(rule);
  const [y, mo, d] = rule.start_date.split('-').map(Number);
  const dow = new Date(y, mo - 1, d).getDay();
  const labelFor = (r) => describeRule({ ...r, label: '' });

  const changePreset = (key) => {
    if (key === 'custom') {
      onSave({ label: labelFor(rule) });
      return;
    }
    const next = resolveRecurrence({ preset: key, business_day_rule: rule.business_day_rule || 'none' }, rule.start_date);
    onSave({ freq_unit: next.freq_unit, freq_interval: next.freq_interval, weekdays: next.weekdays, label: next.label });
  };
  const customPatch = (patch) => {
    const r = { ...rule, ...patch };
    if (r.freq_unit === 'week' && !(r.weekdays || []).length) r.weekdays = [dow];
    if (r.freq_unit !== 'week') r.weekdays = [];
    onSave({ freq_unit: r.freq_unit, freq_interval: r.freq_interval, weekdays: r.weekdays, label: labelFor(r) });
  };
  // 사용자화 화면은 저장된 규칙이 프리셋과 같아도 계속 펼쳐 두기 위해 따로 기억
  const [customOpen, setCustomOpen] = useState(preset === 'custom');
  const shown = customOpen ? 'custom' : preset;
  const unit = rule.freq_unit;
  const txt = { fontSize: 13.25, color: '#191722' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#191722', flex: 'none' }}>반복 주기</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <BareSelect value={shown} options={PRESET_OPTIONS} disabled={disabled} onChange={(k) => { setCustomOpen(k === 'custom'); changePreset(k); }} />
          {shown === 'custom' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <BareNumber value={rule.freq_interval} disabled={disabled} onCommit={(n) => customPatch({ freq_interval: n })} />
              <BareSelect value={unit} options={UNIT_OPTIONS} disabled={disabled} onChange={(u) => customPatch({ freq_unit: u })} />
            </span>
          )}
          {(shown === 'weekly' || shown === 'biweekly') && (
            <BareSelect value={(rule.weekdays || [dow])[0]} options={WEEKDAY_OPTIONS} disabled={disabled} onChange={(w) => onSave({ weekdays: [Number(w)] })} />
          )}
          {(unit === 'month' && shown !== 'daily') && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <BareNumber value={d} max={31} disabled={disabled} onCommit={(n) => onSave({ start_date: withMonthDay(rule.start_date, null, n) })} />
              <span style={txt}>일</span>
            </span>
          )}
          {unit === 'year' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <BareNumber value={mo} max={12} disabled={disabled} onCommit={(n) => onSave({ start_date: withMonthDay(rule.start_date, n, d) })} />
              <span style={txt}>월</span>
              <BareNumber value={d} max={31} disabled={disabled} onCommit={(n) => onSave({ start_date: withMonthDay(rule.start_date, null, n) })} />
              <span style={txt}>일</span>
            </span>
          )}
        </span>
      </div>
      {shown === 'custom' && unit === 'week' && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {WEEKDAY_LABELS.map((w, i) => {
            const on = (rule.weekdays || []).includes(i);
            return (
              <button
                key={i} type="button" disabled={disabled}
                onClick={() => {
                  const next = on ? (rule.weekdays || []).filter((x) => x !== i) : [...(rule.weekdays || []), i].sort();
                  if (next.length) customPatch({ weekdays: next });
                }}
                style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flex: 'none', background: on ? '#191722' : '#f4f2f0', color: on ? '#fff' : '#191722', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >{w}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
