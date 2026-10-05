import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, currentYear } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const onlyDigits = (v) => v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');

// 통계 페이지와 동일한 원형 화살표 버튼 스타일
const roundBtn = {
  width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fff',
  boxShadow: '0 3px 12px rgba(25,23,34,.1)', cursor: 'pointer', color: '#8b8798',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
};
const arrow = (points) => (
  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points={points} /></svg>
);

// 금액 입력: 오른쪽 정렬 인라인 필드 + "원" 접미사. value 가 비어 있으면(= 이 달은 재정의 없음)
// placeholder 로 실제 적용될 금액(기본 예산)을 흐리게 보여준다.
function AmountField({ value, placeholder, onChange, onBlur }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text" inputMode="numeric"
        value={value ? Number(value).toLocaleString('ko-KR') : ''}
        placeholder={placeholder}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
        onBlur={onBlur}
        style={{
          width: 130, textAlign: 'right', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#191722',
          background: 'transparent', border: 'none', outline: 'none', padding: '4px 22px 4px 4px', boxSizing: 'border-box',
        }}
      />
      <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, fontWeight: 600, color: '#a29ead', pointerEvents: 'none' }}>원</span>
    </div>
  );
}

export default function BudgetSet() {
  const { categoryId } = useParams();
  const cid = Number(categoryId);
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [year, setYear] = useState(() => params.get('year') || currentYear());
  const [category, setCategory] = useState(null);
  const [defaultAmount, setDefaultAmount] = useState('');
  const [monthAmounts, setMonthAmounts] = useState({});
  const [loading, setLoading] = useState(true);

  const setYearAndUrl = (y) => {
    setYear(y);
    const next = new URLSearchParams(params);
    next.set('year', y);
    setParams(next, { replace: true });
  };

  // 연도 선택기(select) 목록. 현재 연도 기준 앞뒤로 넉넉히 두고, 선택된 연도가 범위 밖이어도 포함시킨다.
  const yearOptions = useMemo(() => {
    const cur = Number(currentYear());
    const set = new Set();
    for (let y = cur - 20; y <= cur + 5; y++) set.add(y);
    set.add(Number(year));
    return [...set].sort((a, b) => a - b).map(String);
  }, [year]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      db.getCategory(cid),
      db.listCategoryBudgetsForCategoryYear(cid, Number(year)),
    ]).then(([cat, rows]) => {
      setCategory(cat);
      const base = rows.find((r) => r.month === 0);
      setDefaultAmount(base ? String(base.amount) : '');
      const m = {};
      for (const row of rows) { if (row.month >= 1 && row.month <= 12) m[row.month] = String(row.amount); }
      setMonthAmounts(m);
    }).catch((e) => { alert(e.message); nav('/settings/budget'); }).finally(() => setLoading(false));
  }, [cid, year, nav]);
  useEffect(() => { load(); }, [load]);

  if (loading || !category) return <Spinner />;

  const saveDefault = async () => {
    try {
      if (defaultAmount) await db.upsertCategoryBudget(user.id, cid, Number(year), 0, Number(defaultAmount));
      else await db.deleteCategoryBudget(cid, Number(year), 0);
    } catch (e) { alert(e.message); load(); }
  };
  const saveMonth = async (m) => {
    const v = monthAmounts[m];
    try {
      if (v) await db.upsertCategoryBudget(user.id, cid, Number(year), m, Number(v));
      else await db.deleteCategoryBudget(cid, Number(year), m);
    } catch (e) { alert(e.message); load(); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={`${category.name} 예산 설정`} flat />

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <button aria-label="이전" onClick={() => setYearAndUrl(String(Number(year) - 1))} style={roundBtn}>{arrow('15 6 9 12 15 18')}</button>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 60 }}>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722', letterSpacing: '-.2px', whiteSpace: 'nowrap' }}>{year}년</span>
          <select value={year} aria-label="연도 선택" className="catmodal-date-input" onChange={(e) => setYearAndUrl(e.target.value)}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button aria-label="다음" onClick={() => setYearAndUrl(String(Number(year) + 1))} style={roundBtn}>{arrow('9 6 15 12 9 18')}</button>
      </div>

      <div className="tx-daycard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#191722' }}>기본 예산</span>
          <AmountField value={defaultAmount} placeholder="0" onChange={setDefaultAmount} onBlur={saveDefault} />
        </div>
      </div>
      <p className="small muted" style={{ margin: '8px 2px 0' }}>기본 예산을 바꾸면 따로 정하지 않은 달에 모두 적용돼요.</p>

      <div className="tx-daycard" style={{ marginTop: 18 }}>
        {MONTHS.map((m, i) => (
          <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#191722' }}>{m}월</span>
            <AmountField
              value={monthAmounts[m] || ''}
              placeholder={defaultAmount ? fmtNum(defaultAmount) : '0'}
              onChange={(v) => setMonthAmounts((prev) => ({ ...prev, [m]: v }))}
              onBlur={() => saveMonth(m)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
