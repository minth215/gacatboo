import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, currentMonth, periodLabel, shiftPeriod } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { tileBg } from '../components/TransactionList.jsx';
import { effectiveOf } from '../lib/budget.js';

// 통계 페이지와 동일한 원형 화살표 버튼 / 수입·지출 탭 스타일
const roundBtn = {
  width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--k-bg-fff)',
  boxShadow: '0 3px 12px rgb(var(--k-sh) / calc(.1 * var(--k-sha)))', cursor: 'pointer', color: 'var(--k-tx-8b8798)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
};
const arrow = (points) => (
  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points={points} /></svg>
);

export default function BudgetManage() {
  const nav = useNavigate();
  const [type, setType] = useState('expense');
  const [month, setMonth] = useState(currentMonth()); // YYYY-MM
  const [categories, setCategories] = useState([]);
  const [budgetRows, setBudgetRows] = useState([]); // 선택한 연도의 category_budgets 전체(월=0 기본 포함)
  const [totalRows, setTotalRows] = useState([]);   // 선택한 연도의 이 종류 전체 예산(0113)
  const [loading, setLoading] = useState(true);

  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      db.listCategories(type),
      db.listCategoryBudgetsForYear(year),
      db.listTotalBudgetsForYear(year, type).catch(() => []),
    ]).then(([cats, rows, tRows]) => {
      setCategories(cats);
      setBudgetRows(rows);
      setTotalRows(tRows);
    }).catch(() => { setCategories([]); setBudgetRows([]); setTotalRows([]); }).finally(() => setLoading(false));
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

      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <button aria-label="이전" onClick={() => setMonth(shiftPeriod('month', month, -1))} style={roundBtn}>{arrow('15 6 9 12 15 18')}</button>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 88 }}>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)', letterSpacing: '-.2px', whiteSpace: 'nowrap' }}>
            {periodLabel('month', month)}
          </span>
          <input
            type="month" value={month} aria-label="연월 선택" className="catmodal-date-input"
            onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
          />
        </div>
        <button aria-label="다음" onClick={() => setMonth(shiftPeriod('month', month, 1))} style={roundBtn}>{arrow('9 6 15 12 9 18')}</button>
      </div>

      <div style={{ marginTop: 14, display: 'flex', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: 4 }}>
        {[['income', '수입'], ['expense', '지출']].map(([t, label]) => (
          <button key={t} onClick={() => setType(t)} style={{
            flex: 1, border: 'none', borderRadius: 999, padding: '11px 0', fontFamily: 'inherit',
            fontSize: 13.25, fontWeight: 700, cursor: 'pointer',
            background: type === t ? 'var(--k-bg-fff)' : 'transparent', color: type === t ? 'var(--k-tx-191722)' : 'var(--k-tx-8b8798)',
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : categories.length === 0 ? (
        <div className="empty empty-center">등록된 분류가 없습니다.</div>
      ) : (
        <>
          {/* 전체 예산(분류별 예산을 정하지 않은 분류까지 포함한 이 달 전체) */}
          {(() => {
            const total = effectiveOf(totalRows, monthNum);
            return (
              <>
                <div className="tx-daycard" style={{ marginTop: 14 }}>
                  <button
                    type="button" onClick={() => nav(`/settings/budget/${type}/total?year=${year}`)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                  >
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{type === 'income' ? '수입' : '지출'} 전체 예산</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: total == null ? 'var(--k-tx-c7c3cc)' : 'var(--k-tx-191722)', whiteSpace: 'nowrap' }}>{total == null ? '-' : `${fmtNum(total)}원`}</span>
                  </button>
                </div>
              </>
            );
          })()}

          {/* 분류별 예산: 가계부의 같은 날짜 카드처럼 한 카드를 나눠 쓰는 목록 */}
          <div className="tx-daycard" style={{ marginTop: 18 }}>
            {categories.map((c, i) => {
              const amt = effectiveBudget(c.id);
              return (
                <button
                  key={c.id} type="button"
                  onClick={() => nav(`/settings/budget/${type}/${c.id}?year=${year}`)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: 'none', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: c.color || tileBg(c.name) }}>{c.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--k-tx-191722)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: amt == null ? 'var(--k-tx-c7c3cc)' : 'var(--k-tx-191722)', whiteSpace: 'nowrap' }}>
                    {amt == null ? '-' : `${fmtNum(amt)}원`}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
