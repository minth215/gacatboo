import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, currentMonth, shiftMonth, monthLabel } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { tileBg } from '../components/TransactionList.jsx';

const Chevron = () => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c7c3cc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export default function BudgetManage() {
  const nav = useNavigate();
  const [type, setType] = useState('expense');
  const [month, setMonth] = useState(currentMonth()); // YYYY-MM
  const [categories, setCategories] = useState([]);
  const [budgetRows, setBudgetRows] = useState([]); // 선택한 연도의 category_budgets 전체(월=0 기본 포함)
  const [loading, setLoading] = useState(true);

  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      db.listCategories(type),
      db.listCategoryBudgetsForYear(year),
    ]).then(([cats, rows]) => {
      setCategories(cats);
      setBudgetRows(rows);
    }).catch(() => { setCategories([]); setBudgetRows([]); }).finally(() => setLoading(false));
  }, [type, year]);
  useEffect(() => { load(); }, [load]);

  // 해당 달에 적용되는 예산: 그 달 재정의가 있으면 그 값, 없으면 그 해 기본 예산(월=0), 둘 다 없으면 null(미설정)
  const effectiveBudget = (categoryId) => {
    const own = budgetRows.find((r) => r.category_id === categoryId && r.month === monthNum);
    if (own) return Number(own.amount);
    const base = budgetRows.find((r) => r.category_id === categoryId && r.month === 0);
    if (base) return Number(base.amount);
    return null;
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="예산 관리" flat />

      <div className="month-nav" style={{ marginTop: 14 }}>
        <button onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <div className="mlabel">{monthLabel(month)}</div>
        <button onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <div className="pill-toggle" style={{ display: 'flex', width: '100%', marginTop: 4 }}>
        <button style={{ flex: 1 }} className={type === 'income' ? 'income active' : ''} onClick={() => setType('income')}>수입</button>
        <button style={{ flex: 1 }} className={type === 'expense' ? 'expense active' : ''} onClick={() => setType('expense')}>지출</button>
      </div>

      {loading ? (
        <Spinner />
      ) : categories.length === 0 ? (
        <div className="empty empty-center">등록된 분류가 없습니다.</div>
      ) : (
        <div className="ntpl-list" style={{ marginTop: 14 }}>
          {categories.map((c) => {
            const amt = effectiveBudget(c.id);
            return (
              <button
                key={c.id} type="button" className="ntpl-card ntpl-card-btn"
                onClick={() => nav(`/settings/budget/${type}/${c.id}?year=${year}`)}
              >
                <span className="ntpl-emoji" style={{ background: c.color || tileBg(c.name) }}>{c.emoji}</span>
                <span className="ntpl-main" style={{ cursor: 'default' }}>
                  <span className="ntpl-title">{c.name}</span>
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: amt == null ? '#c7c3cc' : '#191722', marginRight: 2, whiteSpace: 'nowrap' }}>
                  {amt == null ? '-' : `${fmtNum(amt)}원`}
                </span>
                <Chevron />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
