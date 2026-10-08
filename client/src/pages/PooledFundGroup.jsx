import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { dotDate, fmtNum } from '../lib/format.js';
import MembersPanel from '../components/MembersPanel.jsx';

// 공금 그룹 상세 페이지: 공금 관리 / 사용 내역 / 이체 내역 / 멤버
export default function PooledFundGroup({ gid, group, members, isOwner, leaderName, header, reloadMembers, userId }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'manage';
  const setTab = useCallback((t) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const [expenses, setExpenses] = useState([]);
  const [expenseMembers, setExpenseMembers] = useState([]);
  const [transfers, setTransfers] = useState([]);

  const loadExpenses = useCallback(() => {
    db.listPooledFundExpenses(gid).then((rows) => {
      setExpenses(rows);
      db.listPooledFundExpenseMembers(rows.map((r) => r.id)).then(setExpenseMembers).catch(() => setExpenseMembers([]));
    }).catch(() => setExpenses([]));
  }, [gid]);
  const loadTransfers = useCallback(() => {
    db.listPooledFundTransfers(gid).then(setTransfers).catch(() => setTransfers([]));
  }, [gid]);
  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  const totalTransferred = transfers.reduce((s, t) => s + Number(t.amount), 0);
  const totalUsed = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const remaining = totalTransferred - totalUsed;

  const memberStats = members.map((m) => {
    const transferred = transfers.filter((t) => t.member_id === m.id).reduce((s, t) => s + Number(t.amount), 0);
    const used = expenseMembers.filter((x) => x.member_id === m.id).reduce((s, x) => s + Number(x.amount), 0);
    return { ...m, transferred, used, remaining: transferred - used };
  });

  const removeExpense = async (e) => {
    if (!confirm('이 사용 내역을 삭제할까요?')) return;
    try { await db.deletePooledFundExpense(e.id); loadExpenses(); } catch (err) { alert(err.message); }
  };
  const removeTransfer = async (t) => {
    if (!confirm('이 이체 내역을 삭제할까요?')) return;
    try { await db.deletePooledFundTransfer(t.id); loadTransfers(); } catch (err) { alert(err.message); }
  };

  return (
    <div style={{ padding: '84px 0 12px' }}>
      {header}

      <div className="underline-tabs">
        <button className={tab === 'manage' ? 'active' : ''} onClick={() => setTab('manage')}>공금 관리</button>
        <button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}>사용 내역</button>
        <button className={tab === 'transfers' ? 'active' : ''} onClick={() => setTab('transfers')}>이체 내역</button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>멤버</button>
      </div>

      {tab === 'manage' && (
        <div style={{ paddingTop: 14 }}>
          <div className="summary-card">
            <div className="col"><div className="lbl">총 금액</div><div className="val income">{fmtNum(totalTransferred)}</div></div>
            <div className="divider" />
            <div className="col"><div className="lbl">사용 금액</div><div className="val expense">{fmtNum(totalUsed)}</div></div>
            <div className="divider" />
            <div className="col"><div className="lbl">잔여 금액</div><div className="val">{fmtNum(remaining)}</div></div>
          </div>
          {memberStats.length === 0 ? <div className="empty">멤버가 없습니다.</div> : memberStats.map((m) => (
            <div key={m.id} className="tx-daycard" style={{ borderRadius: 16, padding: '14px 16px', marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{m.nickname}</span>
                  {m.role === 'owner' && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 7px' }}>{leaderName}</span>}
                  {m.role !== 'owner' && !m.is_account && <span style={{ fontSize: 9, fontWeight: 700, color: '#8b8798', background: '#f4f2f0', borderRadius: 999, padding: '2px 6px' }}>외부</span>}
                </div>
                <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{fmtNum(m.remaining)}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10.75, color: '#a29ead' }}>
                <span style={{ color: m.used > m.transferred ? '#FF6F91' : '#a29ead' }}>{fmtNum(m.transferred)} 원 이체</span>
                {' · '}{fmtNum(m.used)} 원 사용
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'expenses' && (
        <>
          <div className="tx-daygroup" style={{ marginTop: 14 }}>
            {expenses.length === 0 ? <div className="empty empty-center-notabs">사용 내역이 없습니다.</div> : expenses.map((e, i) => (
              <div
                key={e.id} className="tx-row" onClick={() => nav(`/tx/${e.id}?group=${gid}&kind=pooled-expense`)}
                style={{ cursor: 'pointer', borderTop: i > 0 ? '1px solid #f2f1f5' : 'none', background: '#fff', borderRadius: i === 0 ? '20px 20px 0 0' : (i === expenses.length - 1 ? '0 0 20px 20px' : 0), boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tx-row-title"><span className="ttext">{e.content || '공금 사용'}</span></div>
                  <div className="tx-row-sub">{dotDate(e.date)}</div>
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--expense)' }}>-{fmtNum(e.amount)}</span>
              </div>
            ))}
          </div>
          <button className="fab" onClick={() => nav(`/new?group=${gid}&kind=pooled-expense`)} aria-label="추가">
            <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </>
      )}

      {tab === 'transfers' && (
        <>
          <div className="tx-daygroup" style={{ marginTop: 14 }}>
            {transfers.length === 0 ? <div className="empty empty-center-notabs">이체 내역이 없습니다.</div> : transfers.map((t, i) => (
              <div
                key={t.id} className="tx-row" onClick={() => nav(`/tx/${t.id}?group=${gid}&kind=pooled-transfer`)}
                style={{ cursor: 'pointer', borderTop: i > 0 ? '1px solid #f2f1f5' : 'none', background: '#fff', borderRadius: i === 0 ? '20px 20px 0 0' : (i === transfers.length - 1 ? '0 0 20px 20px' : 0), boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tx-row-title"><span className="ttext">{t.content || `${t.member?.nickname || '멤버'} 이체`}</span></div>
                  <div className="tx-row-sub">{t.member?.nickname} · {dotDate(t.date)}</div>
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: '#4b4752' }}>{fmtNum(t.amount)}</span>
              </div>
            ))}
          </div>
          <button className="fab" onClick={() => nav(`/new?group=${gid}&kind=pooled-transfer`)} aria-label="추가">
            <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </>
      )}

      {tab === 'members' && (
        <MembersPanel groupId={gid} members={members} isOwner={isOwner} leaderName={leaderName} onReload={reloadMembers} />
      )}
    </div>
  );
}
