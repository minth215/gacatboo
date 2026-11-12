import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, currentYear } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { findBudgetConflict } from '../lib/budget.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const onlyDigits = (v) => v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');

// 통계 페이지와 동일한 원형 화살표 버튼 스타일
const roundBtn = {
  width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--k-bg-fff)',
  boxShadow: '0 3px 12px rgb(var(--k-sh) / calc(.1 * var(--k-sha)))', cursor: 'pointer', color: 'var(--k-tx-8b8798)',
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
          width: 130, textAlign: 'right', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: 'var(--k-tx-191722)',
          background: 'transparent', border: 'none', outline: 'none', padding: '4px 22px 4px 4px', boxSizing: 'border-box',
        }}
      />
      <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, fontWeight: 600, color: 'var(--k-tx-a29ead)', pointerEvents: 'none' }}>원</span>
    </div>
  );
}

// /settings/budget/:type/:categoryId — categoryId 가 'total' 이면 그 종류(수입/지출)의 전체 예산.
// 전체 예산은 그 달 분류별 예산 합보다 커야 해서, 어느 쪽을 바꾸든 저장 전에 검사한다(어긋나면 되돌림).
export default function BudgetSet() {
  const { type, categoryId } = useParams();
  const isTotal = categoryId === 'total';
  const cid = isTotal ? null : Number(categoryId);
  const typeLabel = type === 'income' ? '수입' : '지출';
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [year, setYear] = useState(() => params.get('year') || currentYear());
  const [category, setCategory] = useState(null);
  const [defaultAmount, setDefaultAmount] = useState('');
  const [monthAmounts, setMonthAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  // 검사용: 이 종류의 분류 id, 그 해 분류별 예산 전체, 그 해 전체 예산
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const showToast = (m) => { setToast(m); setToastKey((k) => k + 1); };
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast, toastKey]);
  const [catIds, setCatIds] = useState([]);
  const [catRows, setCatRows] = useState([]);
  const [totalRows, setTotalRows] = useState([]);

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
      isTotal ? Promise.resolve({ name: `${typeLabel} 전체` }) : db.getCategory(cid),
      db.listCategories(type),
      db.listCategoryBudgetsForYear(Number(year)),
      db.listTotalBudgetsForYear(Number(year), type),
    ]).then(([cat, cats, allCatRows, tRows]) => {
      setCategory(cat);
      setCatIds(cats.map((c) => c.id));
      setCatRows(allCatRows);
      setTotalRows(tRows);
      const rows = isTotal ? tRows : allCatRows.filter((r) => r.category_id === cid);
      const base = rows.find((r) => r.month === 0);
      setDefaultAmount(base ? String(base.amount) : '');
      const m = {};
      for (const row of rows) { if (row.month >= 1 && row.month <= 12) m[row.month] = String(row.amount); }
      setMonthAmounts(m);
    }).catch((e) => { alert(e.message); nav('/settings/budget'); }).finally(() => setLoading(false));
  }, [cid, isTotal, type, year, nav]);
  useEffect(() => { load(); }, [load]);

  if (loading || !category) return <Spinner />;

  // 바꾼 값을 반영했을 때 전체 예산 ≤ 분류별 합이 되는 달이 있으면 막고 되돌림
  const violates = (month, v) => {
    const y = Number(year);
    const apply = (rows, match, extra) => [...rows.filter((r) => !match(r)), ...(v ? [{ ...extra, year: y, month, amount: Number(v) }] : [])];
    const nextTotal = isTotal ? apply(totalRows, (r) => r.month === month, {}) : totalRows;
    const nextCat = isTotal ? catRows : apply(catRows, (r) => r.category_id === cid && r.month === month, { category_id: cid });
    const c = findBudgetConflict(nextTotal, nextCat, catIds);
    if (!c) return false;
    showToast(`${c.month}월 ${typeLabel} 전체 예산(${fmtNum(c.total)}원)은 분류별 예산 합계(${fmtNum(c.sum)}원)보다 커야 해요`);
    // 입력값을 저장된 값으로 되돌림(다시 불러오지 않아 화면이 깜빡이지 않음)
    const own = (isTotal ? totalRows : catRows.filter((r) => r.category_id === cid));
    if (month === 0) { const b = own.find((r) => r.month === 0); setDefaultAmount(b ? String(b.amount) : ''); }
    else { const o = own.find((r) => r.month === month); setMonthAmounts((prev) => ({ ...prev, [month]: o ? String(o.amount) : '' })); }
    return true;
  };
  const upsert = (m, v) => (isTotal ? db.upsertTotalBudget(user.id, type, Number(year), m, Number(v)) : db.upsertCategoryBudget(user.id, cid, Number(year), m, Number(v)));
  const remove = (m) => (isTotal ? db.deleteTotalBudget(type, Number(year), m) : db.deleteCategoryBudget(cid, Number(year), m));
  // 저장 성공 후 검사용 목록만 갱신(다시 불러오면 화면이 깜빡이고 다음 칸 포커스가 풀림)
  const syncLocal = (month, v) => {
    const y = Number(year);
    if (isTotal) setTotalRows((rows) => [...rows.filter((r) => r.month !== month), ...(v ? [{ year: y, month, amount: Number(v) }] : [])]);
    else setCatRows((rows) => [...rows.filter((r) => !(r.category_id === cid && r.month === month)), ...(v ? [{ category_id: cid, year: y, month, amount: Number(v) }] : [])]);
  };
  const saveDefault = async () => {
    if (violates(0, defaultAmount)) return;
    try {
      if (defaultAmount) await upsert(0, defaultAmount); else await remove(0);
      syncLocal(0, defaultAmount);
    } catch (e) { alert(e.message); load(); }
  };
  const saveMonth = async (m) => {
    const v = monthAmounts[m];
    if (violates(m, v)) return;
    try {
      if (v) await upsert(m, v); else await remove(m);
      syncLocal(m, v);
    } catch (e) { alert(e.message); load(); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={isTotal ? `${typeLabel} 전체 예산 설정` : `${category.name} 예산 설정`} flat />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <button aria-label="이전" onClick={() => setYearAndUrl(String(Number(year) - 1))} style={roundBtn}>{arrow('15 6 9 12 15 18')}</button>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 60 }}>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)', letterSpacing: '-.2px', whiteSpace: 'nowrap' }}>{year}년</span>
          <select value={year} aria-label="연도 선택" className="catmodal-date-input" onChange={(e) => setYearAndUrl(e.target.value)}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button aria-label="다음" onClick={() => setYearAndUrl(String(Number(year) + 1))} style={roundBtn}>{arrow('9 6 15 12 9 18')}</button>
      </div>

      <div className="tx-daycard" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--k-tx-191722)' }}>기본 예산</span>
          <AmountField value={defaultAmount} placeholder="0" onChange={setDefaultAmount} onBlur={saveDefault} />
        </div>
      </div>

      <div className="tx-daycard" style={{ marginTop: 18 }}>
        {MONTHS.map((m, i) => (
          <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{m}월</span>
            <AmountField
              value={monthAmounts[m] || ''}
              placeholder={defaultAmount ? fmtNum(defaultAmount) : '0'}
              onChange={(v) => setMonthAmounts((prev) => ({ ...prev, [m]: v }))}
              onBlur={() => saveMonth(m)}
            />
          </div>
        ))}
      </div>
      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
    </div>
  );
}
