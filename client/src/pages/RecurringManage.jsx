import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, fmtForeign, dotDate } from '../lib/format.js';
import { describeRule, periodDetailLabel, BUSINESS_DAY_LABELS } from '../lib/recurrence.js';
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
              >
                <span className="tx-tile" style={{ background: r.category_color || (dispType === 'income' ? '#E5FBF6' : dispType === 'transfer' ? '#EFEDF5' : '#FFE9EF') }}>
                  {dispEmoji || (dispType === 'income' ? '💰' : dispType === 'transfer' ? '🔁' : '💸')}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tx-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ttext">{r.content || dispName || (dispType === 'income' ? '수입' : dispType === 'transfer' ? '이체' : '지출')}</span>
                    {r.group_name && (
                      <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>{r.group_name}</span>
                    )}
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
                  <span style={{ fontSize: 13.25, color: '#6c6779' }}>{dotDate(detail.start_date)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#191722', flex: 'none' }}>반복 종료일</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="catmodal-date-field" style={{ minWidth: 128 }}>
                      <div className={`catmodal-date-value${detail.end_date ? '' : ' placeholder'}`} style={{ textAlign: 'right' }}>
                        {detail.end_date ? dotDate(detail.end_date) : '종료일 없음'}
                      </div>
                      <input
                        type="date" value={detail.end_date || ''} disabled={saving} className="catmodal-date-input"
                        onChange={(e) => { if (e.target.value) saveEndDate(e.target.value); }}
                      />
                    </div>
                    {detail.end_date && (
                      <button type="button" onClick={() => saveEndDate('')} disabled={saving} className="edit-link" style={{ flex: 'none' }}>지우기</button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>반복 주기</span>
                  <span style={{ fontSize: 13.25, color: '#6c6779' }}>{periodDetailLabel(detail)}</span>
                </div>

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
