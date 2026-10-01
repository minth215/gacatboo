import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, dotDate } from '../lib/format.js';
import { describeRule } from '../lib/recurrence.js';
import PageHeader from '../components/PageHeader.jsx';
import RecurrenceModal from '../components/RecurrenceModal.jsx';

export default function RecurringManage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [picking, setPicking] = useState(false);

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

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="반복 관리" flat />

      {rules.length === 0 ? (
        <div className="empty empty-center">등록된 반복 항목이 없습니다.</div>
      ) : (
        <div className="tx-daycard" style={{ marginTop: 14 }}>
          {rules.map((r, i) => {
            // 입금 반복은 총대(수입)/멤버(지출) 두 관점이 공존 — 지금 보는 사람이 총대인지에 따라 표시 전환
            const isOwnerView = r.target === 'subscription_deposit' && r.group?.owner_id === user.id;
            const dispType = r.target === 'subscription_deposit' ? (isOwnerView ? 'income' : 'expense') : r.type;
            const dispName = isOwnerView ? r.leader_category_name : r.category_name;
            const dispEmoji = isOwnerView ? r.leader_category_emoji : r.category_emoji;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 16px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
                <span style={{
                  width: 38, height: 38, borderRadius: 12, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16.5, background: r.category_color || (dispType === 'income' ? '#E5FBF6' : '#FFE9EF'),
                }}>
                  {dispEmoji || (dispType === 'income' ? '💰' : '💸')}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13.75, fontWeight: 700, color: '#191722', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.content || dispName || (dispType === 'income' ? '수입' : '지출')}
                    </span>
                    {r.group_name && (
                      <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>{r.group_name}</span>
                    )}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#a29ead', marginTop: 2 }}>
                    {describeRule(r)} · {dotDate(r.start_date)}부터 · {fmtWon(r.amount)}
                  </span>
                </span>
                <button aria-label="반복 해제" onClick={() => del(r)} className="cat-del-btn">
                  <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button className="fab" onClick={() => setPicking(true)} aria-label="반복 추가">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {picking && <RecurrenceModal onClose={() => setPicking(false)} onSelect={onSelectPeriod} />}
    </div>
  );
}
