import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { currentMonth, shiftMonth, fmtNum } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';
import CatMascot from '../components/CatMascot.jsx';

const roundBtn = (size = 36) => ({
  width: size, height: size, borderRadius: '50%', border: 'none', background: '#fff',
  boxShadow: '0 3px 12px rgba(25,23,34,.1)', cursor: 'pointer', color: '#6c6779',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
});

export default function Ledger() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ income: 0, expense: 0 });
  const [view, setView] = useState('list'); // list | calendar
  const [selDay, setSelDay] = useState(null);

  // 검색어(전체 기간) / 이 달 필터
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('');
  const [srcFilter, setSrcFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    db.listLedger({ month })
      .then(async (list) => {
        setTxs(list);
        const exList = list.filter((t) => t.type === 'expense');
        const map = await db.settlementsByTarget(exList.map((t) => t.id));
        const expense = exList.reduce((s, t) => s + Math.max(0, Number(t.amount) - (map[t.id] || 0)), 0);
        const excess = exList.reduce((s, t) => s + Math.max(0, (map[t.id] || 0) - Number(t.amount)), 0);
        const income = list.filter((t) => t.type === 'income' && t.settlement_target_id == null).reduce((s, t) => s + Number(t.amount), 0) + excess;
        setSummary({ income, expense });
      })
      .catch(() => { setTxs([]); setSummary({ income: 0, expense: 0 }); })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const { income, expense } = summary;

  const catOptions = useMemo(() => [...new Set(txs.map((t) => t.category_name).filter(Boolean))].sort(), [txs]);
  const srcOptions = useMemo(() => [...new Set(txs.map((t) => t.source_name).filter(Boolean))].sort(), [txs]);

  const active = typeFilter !== 'all' || catFilter || srcFilter;
  const filtered = useMemo(() => txs.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter && (t.category_name || '') !== catFilter) return false;
    if (srcFilter && (t.source_name || '') !== srcFilter) return false;
    return true;
  }), [txs, typeFilter, catFilter, srcFilter]);

  const reset = () => { setTypeFilter('all'); setCatFilter(''); setSrcFilter(''); };
  const runSearch = () => nav(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);

  const canEdit = (t) => (t.origin_type ? true : t.created_by === user.id);
  const openEdit = (t) => {
    if (t.origin_type) nav(`/groups/${t.origin_group_id}?edit=${t.origin_type}:${t.origin_id}`);
    else nav(`/tx/${t.id}`);
  };
  const remove = async (t) => {
    const msg = t.origin_type
      ? '이 항목을 삭제하면 그룹의 결제/입금 내역과 연결된 다른 가계부 항목도 함께 삭제됩니다. 계속할까요?'
      : '이 항목을 삭제할까요?';
    if (!confirm(msg)) return;
    try {
      if (t.origin_type === 'payment') await db.deletePayment(t.origin_id);
      else if (t.origin_type === 'deposit') await db.deleteDeposit(t.origin_id);
      else await db.deleteTransaction(t.id);
      load();
    } catch (e) { alert(e.message); }
  };

  // ----- 캘린더 뷰 데이터 -----
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const perDay = useMemo(() => {
    const map = {};
    for (const t of filtered) {
      const d = Number(t.date.slice(8, 10));
      (map[d] ||= { income: 0, expense: 0 });
      map[d][t.type === 'income' ? 'income' : 'expense'] += Number(t.amount);
    }
    return map;
  }, [filtered]);
  const dayTxs = useMemo(() => (selDay ? filtered.filter((t) => Number(t.date.slice(8, 10)) === selDay) : []), [filtered, selDay]);

  const [yy, mm] = month.split('-');
  const label = `${yy} 년 ${Number(mm)} 월`;

  return (
    <div style={{ padding: '4px 0 12px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.6px', color: '#191722' }}>가계부</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button aria-label="검색" onClick={runSearch} style={roundBtn(36)}>
            <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></svg>
          </button>
          <button aria-label="필터" onClick={() => setShowFilter((v) => !v)} style={{ ...roundBtn(36), color: active ? '#FF3B5C' : '#6c6779' }}>
            <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="17" x2="14" y2="17" /></svg>
          </button>
        </div>
      </div>

      {/* 월 이동 */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="이전 달" onClick={() => { setMonth(shiftMonth(month, -1)); setSelDay(null); }} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#191722', letterSpacing: '-.2px' }}>{label}</span>
        <button aria-label="다음 달" onClick={() => { setMonth(shiftMonth(month, 1)); setSelDay(null); }} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>

      {/* 뷰 전환 + 고양이 */}
      <div style={{ marginTop: -18, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 8, paddingRight: 20, position: 'relative', zIndex: 3 }}>
        <button aria-label="뷰 전환" onClick={() => setView((v) => (v === 'list' ? 'calendar' : 'list'))}
          style={{ position: 'relative', width: 34, height: 26, borderRadius: 12, border: 'none', background: '#eceae7', color: '#4a4640', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flex: 'none', marginBottom: 16 }}>
          <svg width="8" height="7.5" viewBox="0 0 8 7.5" style={{ position: 'absolute', right: 3, bottom: -4.5, pointerEvents: 'none' }} aria-hidden="true"><path d="M1.1 0 Q-0.8 5.3 7.9 6.8 Q4.7 4.7 4.2 0 Z" fill="#eceae7" /></svg>
          {view === 'list' ? (
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="6" /><line x1="16" y1="3" x2="16" y2="6" /></svg>
          ) : (
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" /></svg>
          )}
        </button>
        <CatMascot width={70} />
      </div>

      {/* 필터 패널 */}
      {showFilter && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, marginBottom: 12, boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}>
          <div className="pill-toggle" style={{ display: 'flex', width: '100%' }}>
            <button style={{ flex: 1 }} className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>전체</button>
            <button style={{ flex: 1 }} className={typeFilter === 'income' ? 'income active' : ''} onClick={() => setTypeFilter('income')}>수입</button>
            <button style={{ flex: 1 }} className={typeFilter === 'expense' ? 'expense active' : ''} onClick={() => setTypeFilter('expense')}>지출</button>
          </div>
          <div className="grid2" style={{ marginTop: 8 }}>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
              <option value="">분류 전체</option>
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
              <option value="">원천 전체</option>
              {srcOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {active && <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={reset}>필터 초기화</button>}
        </div>
      )}

      {/* 요약 카드 */}
      <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 6px 20px rgba(25,23,34,.07)', display: 'flex', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>수입</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#2CDDB9' }}>{fmtNum(income)}</div></div>
        <div style={{ width: 1, height: 30, background: '#efeef2' }} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>지출</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#FF4358' }}>{fmtNum(expense)}</div></div>
        <div style={{ width: 1, height: 30, background: '#efeef2' }} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#9a96a5' }}>합계</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: '#191722' }}>{fmtNum(income - expense)}</div></div>
      </div>

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : view === 'calendar' ? (
        <>
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, padding: '14px 12px 12px', boxShadow: '0 4px 16px rgba(25,23,34,.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: '#a29ead' }}>
              <span style={{ color: '#e0607a' }}>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style={{ color: '#7b93c9' }}>토</span>
            </div>
            <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
              {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const pd = perDay[day];
                const sel = selDay === day;
                return (
                  <div key={day} onClick={() => setSelDay(sel ? null : day)}
                    style={{ minHeight: 54, borderRadius: 10, padding: '5px 2px 3px', textAlign: 'center', cursor: 'pointer', background: sel ? '#FFF0DC' : 'transparent' }}>
                    <div style={{ fontSize: 11, fontWeight: sel ? 800 : 600, color: sel ? '#191722' : '#6c6779' }}>{day}</div>
                    {pd?.expense > 0 && <div style={{ marginTop: 2, fontSize: 8, fontWeight: 700, letterSpacing: '-.3px', color: '#FF4358' }}>-{fmtNum(pd.expense)}</div>}
                    {pd?.income > 0 && <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '-.3px', color: '#2CDDB9' }}>+{fmtNum(pd.income)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          {selDay && (
            <div style={{ marginTop: 6 }}>
              <TransactionList transactions={dayTxs} canEdit={canEdit} onEdit={openEdit} onDelete={remove} />
            </div>
          )}
        </>
      ) : (
        <TransactionList transactions={filtered} canEdit={canEdit} onEdit={openEdit} onDelete={remove} />
      )}

      <button className="fab" onClick={() => nav('/new')} aria-label="추가">＋</button>
    </div>
  );
}
