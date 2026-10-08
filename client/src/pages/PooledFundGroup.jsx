import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate, fmtNum } from '../lib/format.js';
import MembersPanel from '../components/MembersPanel.jsx';
import Spinner from '../components/Spinner.jsx';

const matchSourceId = (flat, name) => { const s = flat.find((x) => x.name === name); return s ? String(s.id) : ''; };

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

// 공금 이체 내역 전용 입력 폼(TransactionForm 의 이체 탭과 달리, 멤버 선택 + 출금 수단만 받고
// 입금 쪽은 항상 그룹의 공금 통장으로 고정). 본인 이체가 아니면(총무가 다른 멤버 대신 입력하는
// 경우) RLS 상 그 멤버의 원천 목록을 조회할 수 없어 출금 수단을 직접 입력하는 텍스트로 대체한다.
export function PooledTransferForm({ initial, group, members, sub, isOwner, onSaved, groupBadge }) {
  const { user } = useAuth();
  const editing = !!initial;
  const poolName = sub?.deposit_source_name || '공금 통장';
  const myMember = members.find((m) => m.user_id === user.id);

  const [memberId, setMemberId] = useState(() => (editing ? String(initial.member_id) : (myMember ? String(myMember.id) : '')));
  const [date, setDate] = useState(initial?.date || today());
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [fromSourceName, setFromSourceName] = useState(initial?.from_source_name || '');
  const [fromSourceId, setFromSourceId] = useState('');
  const [content, setContent] = useState(initial?.content ?? null);
  const [memo, setMemo] = useState(initial?.memo || '');
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const memoRef = useRef(null);

  const selMember = members.find((m) => String(m.id) === memberId);
  const isSelf = selMember && selMember.user_id === user.id;

  useEffect(() => {
    if (!isSelf) return;
    db.listSources().then(setSources).catch(() => {});
  }, [isSelf]);
  useEffect(() => {
    if (!editing || !isSelf || !sources.flat.length || fromSourceId) return;
    const id = matchSourceId(sources.flat, fromSourceName);
    if (id) setFromSourceId(id);
  }, [editing, isSelf, sources, fromSourceName, fromSourceId]);
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [memo]);

  const autoContent = fromSourceName ? `${fromSourceName} → ${poolName}` : '';
  const contentValue = content ?? autoContent;
  const onContentChange = (e) => setContent(e.target.value);
  const onContentBlur = () => { if (content === '') setContent(null); };

  const onFromSourceSelect = (v) => {
    setFromSourceId(v);
    const s = sources.flat.find((x) => String(x.id) === v);
    setFromSourceName(s?.name || '');
  };

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' };
  const rowLabelStyle = { width: 46, flex: 'none', fontSize: 13.5, fontWeight: 400, color: '#8b8798' };
  const rowInputStyle = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#191722', outline: 'none', textAlign: 'right', padding: 0 };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!memberId) return setErr('멤버를 선택하세요.');
    if (!(Number(amount) > 0)) return setErr('금액을 입력하세요.');
    setBusy(true);
    try {
      const p = { date, amount: Math.round(Number(amount)), from_source_name: fromSourceName, content: (contentValue || '').trim(), memo };
      if (editing) await db.updatePooledFundTransfer(initial.id, p);
      else await db.createPooledFundTransfer({ group_id: group.id, member_id: Number(memberId), ...p });
      onSaved?.();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <div className="rcpt-card">
        <input
          type="text" value={contentValue} onChange={onContentChange} onBlur={onContentBlur} placeholder="내용"
          style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 20, fontWeight: 800, color: '#191722', outline: 'none', padding: groupBadge ? '0 0 6px' : '0 0 14px' }}
        />
        {groupBadge && (
          <span style={{ display: 'inline-block', marginBottom: 10, padding: '3px 9px', borderRadius: 999, background: groupBadge.color || '#e4e2e6', fontSize: 10.5, fontWeight: 700, color: '#6c6779' }}>
            {groupBadge.name}
          </span>
        )}

        <div style={rowStyle}>
          <span style={rowLabelStyle}>멤버</span>
          <select value={memberId} onChange={(e) => { setMemberId(e.target.value); setFromSourceId(''); setFromSourceName(''); }} disabled={editing || !isOwner} style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right' }}>
            <option value="">선택 안 함</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
          </select>
        </div>

        <div style={rowStyle}>
          <span style={rowLabelStyle}>날짜</span>
          <div style={{ position: 'relative', flex: 1, textAlign: 'right' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#191722' }}>{dotDate(date)}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="catmodal-date-input" aria-label="날짜 선택" />
          </div>
        </div>

        <div style={rowStyle}>
          <span style={rowLabelStyle}>출금</span>
          {isSelf ? (
            <select value={fromSourceId} onChange={(e) => onFromSourceSelect(e.target.value)} style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right' }}>
              <option value="">출금 수단 선택</option>
              {sources.tree.map((top) => (
                top.children?.length ? (
                  <optgroup key={top.id} label={top.name}>
                    {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ) : (
                  <option key={top.id} value={top.id}>{top.name}</option>
                )
              ))}
            </select>
          ) : (
            <input
              type="text" value={fromSourceName} onChange={(e) => setFromSourceName(e.target.value)} placeholder="출금 수단 입력"
              style={rowInputStyle}
            />
          )}
        </div>

        <div style={rowStyle}>
          <span style={rowLabelStyle}>입금</span>
          <span style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: '#191722' }}>{poolName}</span>
        </div>

        <div style={rowStyle}>
          <span style={rowLabelStyle}>금액</span>
          <input
            type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            style={rowInputStyle}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="rcpt-dots" />
          <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 400, color: '#a29ead', letterSpacing: '.3px' }}>메모</span>
          <span className="rcpt-dots" style={{ textAlign: 'right' }} />
        </div>
        <textarea
          ref={memoRef} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="추가 설명을 적어주세요" rows={2}
          style={{ marginTop: 8, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: '#191722', outline: 'none', resize: 'none', padding: 0, overflow: 'hidden' }}
        />
      </div>

      {err && <p className="error" style={{ marginTop: 14 }}>{err}</p>}
      <button className="btn-ink-pill" style={{ marginTop: 26 }} disabled={busy}>{busy ? '저장 중…' : editing ? '수정' : '저장'}</button>
    </form>
  );
}
