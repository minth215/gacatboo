import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';

export default function Search() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get('q') || '');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // 필터 (전체 기간 서버 조회)
  const [showFilter, setShowFilter] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | income | expense
  const [catFilter, setCatFilter] = useState('');
  const [srcFilter, setSrcFilter] = useState('');

  const [catOptions, setCatOptions] = useState([]);
  const [srcOptions, setSrcOptions] = useState([]);

  useEffect(() => {
    db.listCategories()
      .then((cs) => setCatOptions([...new Set(cs.map((c) => c.name).filter(Boolean))]))
      .catch(() => {});
    db.listSources()
      .then(({ flat }) => setSrcOptions([...new Set(flat.map((s) => s.name).filter(Boolean))]))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    db.searchTransactions({
      from: from || undefined,
      to: to || undefined,
      type: typeFilter,
      category: catFilter || undefined,
      source: srcFilter || undefined,
    })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [from, to, typeFilter, catFilter, srcFilter]);

  useEffect(() => { load(); }, [load]);

  // 텍스트 검색은 클라이언트에서 (내용·분류·원천·메모)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((t) => {
      const hay = [t.content, t.category_name, t.source_name, t.memo].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q]);

  const fIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const fExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const filterActive = !!(from || to || typeFilter !== 'all' || catFilter || srcFilter);
  const resetFilter = () => { setFrom(''); setTo(''); setTypeFilter('all'); setCatFilter(''); setSrcFilter(''); };

  const onSearchChange = (v) => {
    setQ(v);
    const next = new URLSearchParams(params);
    if (v.trim()) next.set('q', v); else next.delete('q');
    setParams(next, { replace: true });
  };

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

  const selStyle = { padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' };

  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav('/')} style={{ marginBottom: 8, paddingLeft: 0 }}>‹ 가계부</button>
      <h2 style={{ margin: '4px 2px 14px', fontSize: 20 }}>검색</h2>

      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <div className="row">
          <input
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="내용·분류·원천 검색 (전체 기간)"
            style={{ flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}
            autoFocus
          />
          <button className="btn sm" onClick={() => setShowFilter((v) => !v)}>필터{filterActive ? ' •' : ''}</button>
        </div>

        {showFilter && (
          <div style={{ marginTop: 10 }}>
            <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>기간</label>
            <div className="grid2">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={selStyle} />
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={selStyle} />
            </div>

            <div className="pill-toggle" style={{ display: 'flex', width: '100%', marginTop: 8 }}>
              <button style={{ flex: 1 }} className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>전체</button>
              <button style={{ flex: 1 }} className={typeFilter === 'income' ? 'income active' : ''} onClick={() => setTypeFilter('income')}>수입</button>
              <button style={{ flex: 1 }} className={typeFilter === 'expense' ? 'expense active' : ''} onClick={() => setTypeFilter('expense')}>지출</button>
            </div>

            <div className="grid2" style={{ marginTop: 8 }}>
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={selStyle}>
                <option value="">분류 전체</option>
                {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)} style={selStyle}>
                <option value="">원천 전체</option>
                {srcOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {filterActive && <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={resetFilter}>필터 초기화</button>}
          </div>
        )}

        <div className="small muted" style={{ marginTop: 8 }}>
          결과 {filtered.length}건 · <span style={{ color: 'var(--income)', fontWeight: 700 }}>+{fmtWon(fIncome)}</span> · <span style={{ color: 'var(--expense)', fontWeight: 700 }}>-{fmtWon(fExpense)}</span>
        </div>
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
    </div>
  );
}
