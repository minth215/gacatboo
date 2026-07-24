import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { currentMonth, shiftMonth, monthLabel, fmtWon } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';

export default function Ledger() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ income: 0, expense: 0 });

  // 검색 / 필터
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | income | expense
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

  const active = q.trim() || typeFilter !== 'all' || catFilter || srcFilter;
  const filtered = useMemo(() => txs.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (catFilter && (t.category_name || '') !== catFilter) return false;
    if (srcFilter && (t.source_name || '') !== srcFilter) return false;
    if (q.trim()) {
      const hay = [t.content, t.category_name, t.source_name, t.memo].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [txs, q, typeFilter, catFilter, srcFilter]);

  const fIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const fExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const reset = () => { setQ(''); setTypeFilter('all'); setCatFilter(''); setSrcFilter(''); };

  const canEdit = (t) => (t.origin_type ? true : t.created_by === user.id);
  const openEdit = (t) => {
    if (t.origin_type) nav(`/groups/${t.origin_group_id}?edit=${t.origin_type}:${t.origin_id}`);
    else nav(`/tx/${t.id}`);
  };
  const remove = async (t) => {
    const linked = !!t.origin_type;
    const msg = linked
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

  const inputStyle = { flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' };

  return (
    <div>
      <div className="month-nav">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
        <div className="mlabel">{monthLabel(month)}</div>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
      </div>

      <div className="summary" style={{ marginBottom: 12 }}>
        <div className="box"><div className="lbl">수입</div><div className="val income">{fmtWon(income)}</div></div>
        <div className="box"><div className="lbl">지출</div><div className="val expense">{fmtWon(expense)}</div></div>
        <div className="box"><div className="lbl">합계</div><div className="val">{fmtWon(income - expense)}</div></div>
      </div>

      {/* 검색 / 필터 */}
      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <div className="row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="내용·분류·원천 검색" style={inputStyle} />
          <button className="btn sm" onClick={() => setShowFilter((v) => !v)}>필터{active ? ' •' : ''}</button>
        </div>
        {showFilter && (
          <div style={{ marginTop: 10 }}>
            <div className="pill-toggle" style={{ display: 'flex', width: '100%' }}>
              <button style={{ flex: 1 }} className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>전체</button>
              <button style={{ flex: 1 }} className={typeFilter === 'income' ? 'income active' : ''} onClick={() => setTypeFilter('income')}>수입</button>
              <button style={{ flex: 1 }} className={typeFilter === 'expense' ? 'expense active' : ''} onClick={() => setTypeFilter('expense')}>지출</button>
            </div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
                <option value="">분류 전체</option>
                {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
                <option value="">원천 전체</option>
                {srcOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {active && <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={reset}>필터 초기화</button>}
          </div>
        )}
        {active && (
          <div className="small muted" style={{ marginTop: 8 }}>
            결과 {filtered.length}건 · <span style={{ color: 'var(--income)', fontWeight: 700 }}>+{fmtWon(fIncome)}</span> · <span style={{ color: 'var(--expense)', fontWeight: 700 }}>-{fmtWon(fExpense)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : (
        <TransactionList
          transactions={filtered}
          canEdit={canEdit}
          onEdit={openEdit}
          onDelete={remove}
        />
      )}

      <button className="fab" onClick={() => nav('/new')} aria-label="추가">＋</button>
    </div>
  );
}
