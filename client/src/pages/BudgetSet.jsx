import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, currentYear } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const onlyDigits = (v) => v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');

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

      <div className="month-nav" style={{ marginTop: 14 }}>
        <button onClick={() => setYearAndUrl(String(Number(year) - 1))}>‹</button>
        <div className="mlabel">{year}년</div>
        <button onClick={() => setYearAndUrl(String(Number(year) + 1))}>›</button>
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
