import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, countedRows, isCardBill } from '../lib/db.js';
import BudgetBar from '../components/BudgetBar.jsx';
import { effectiveOf } from '../lib/budget.js';
import { fmtNum, currentMonth, shiftMonth } from '../lib/format.js';
import CartFilterSheet from '../components/CartFilterSheet.jsx';
import Spinner from '../components/Spinner.jsx';
import { DayCardRow, tileBg, formatDate } from '../components/TransactionList.jsx';

// 장바구니(하단 탭): 앞으로 살 품목을 담아 두고 지출 계획을 세우는 목록.
// 가계부처럼 연월 컨트롤바로 달을 고르고, 그 달에 구매 예정일이 있는 품목을 날짜별로(N 일 ㅇ요일),
// 예정일이 미정인 품목은 어느 달이든 맨 아래에 모아 보여 준다.
export const cartTotal = (items) => (items || []).reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.qty) || 1), 0);
export const cartHasAmount = (items) => (items || []).some((it) => it.amount != null && it.amount !== '');

const MONTH_KEY = 'cart:month';
const roundBtn = (size = 36) => ({
  width: size, height: size, borderRadius: '50%', border: 'none', background: 'var(--k-bg-fff)',
  boxShadow: '0 3px 12px rgb(var(--k-sh) / calc(.1 * var(--k-sha)))', cursor: 'pointer', color: 'var(--k-tx-6c6779)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none',
});

export default function Cart() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [cats, setCats] = useState([]);
  const [openId, setOpenId] = useState(null);
  // 보던 달은 상세에 다녀와도 유지
  const [month, setMonthState] = useState(() => { try { return sessionStorage.getItem(MONTH_KEY) || currentMonth(); } catch { return currentMonth(); } });
  const setMonth = (m) => { setMonthState(m); try { sessionStorage.setItem(MONTH_KEY, m); } catch { /* ignore */ } };

  // 그 달 전체 지출 예산 + 확정 지출(통계 분류별과 같은 기준: 결제 대금 제외, 집계 제외 원천 제외, 정산 반영)
  const [budget, setBudget] = useState(undefined); // undefined=불러오는 중, null=미설정
  const [spent, setSpent] = useState(0);
  useEffect(() => {
    let alive = true;
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    setBudget(undefined);
    db.listTotalBudgetsForYear(y, 'expense').then((rs) => { if (alive) setBudget(effectiveOf(rs, m)); }).catch(() => { if (alive) setBudget(null); });
    db.statsRows({ start, endExclusive: next }).then((list) => {
      if (!alive) return;
      const sum = countedRows(list.filter((r) => !isCardBill(r))).filter((r) => r.type === 'expense').reduce((t, r) => t + Math.max(Number(r.eff ?? r.amount) || 0, 0), 0);
      setSpent(sum);
    }).catch(() => { if (alive) setSpent(0); });
    return () => { alive = false; };
  }, [month]);

  // 상단바 검색(전체 기간, 내용·항목·메모·분류) + 필터(상태·분류)
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filterCats, setFilterCats] = useState([]);
  const [status, setStatus] = useState('all');
  const filterActive = filterCats.length > 0 || status !== 'all';
  const openSearch = () => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 260); };
  const closeSearch = () => { setSearchOpen(false); setQ(''); };

  const load = () => db.listCartItems().then(setRows).catch((e) => { alert(e.message); setRows([]); });
  useEffect(() => { load(); db.listCategories('expense').then(setCats).catch(() => {}); }, []);

  const revert = async (r) => {
    if (!confirm('구매 예정 상태로 되돌립니다.')) return;
    try { await db.unmarkCartPurchased(r.id); setOpenId(null); load(); } catch (e) { alert(e.message); }
  };
  const del = async (r) => {
    if (!confirm(`'${r.content || '품목'}'을(를) 장바구니에서 삭제할까요?`)) return;
    try { await db.deleteCartItem(r.id); load(); } catch (e) { alert(e.message); }
  };

  if (!rows) return <Spinner />;
  // 이모지 배경: 분류 관리에서 지정한 색(분류 id, 없으면 이름으로 찾음)
  const tileColorOf = (r) => {
    const c = cats.find((x) => (r.category_id && x.id === r.category_id)) || cats.find((x) => x.name === r.category_name);
    return c?.color || (r.category_emoji ? tileBg(r.category_name) : 'var(--k-bg-f2f1f5)');
  };
  // 같은 날짜 안에서는 구매 전 → 구매 완료, 그다음 최근 담은 순
  const order = (a, b) => (!!a.purchased_at - !!b.purchased_at) || b.id - a.id;
  const term = q.trim().toLowerCase();
  const passFilter = (r) => (status === 'all' || (status === 'done' ? !!r.purchased_at : !r.purchased_at))
    && (!filterCats.length || filterCats.includes(r.category_name));
  const matches = (r) => !term || [r.content, r.memo, r.category_name, r.link_name, ...(r.items || []).map((it) => it.name)]
    .filter(Boolean).join(' ').toLowerCase().includes(term);
  const shown = rows.filter((r) => passFilter(r) && (!searchOpen || matches(r)));
  // 검색 중에는 전체 기간, 아니면 고른 달
  const inMonth = shown.filter((r) => r.planned_date && (searchOpen || r.planned_date.slice(0, 7) === month));
  const dates = [...new Set(inMonth.map((r) => r.planned_date))].sort();
  const undated = shown.filter((r) => !r.planned_date).sort(order);
  const [yy, mm] = month.split('-');
  // 이 달 구매 예정(아직 구매하지 않은 품목) 금액 합
  const plannedSum = rows.filter((r) => !r.purchased_at && r.planned_date && r.planned_date.slice(0, 7) === month).reduce((t, r) => t + cartTotal(r.items), 0);

  const card = (r, i, list) => {
    const items = r.items || [];
    const checked = items.filter((it) => it.checked).length;
    const total = cartTotal(items);
    const sub = r.category_name || '—';
    return (
      <DayCardRow
        key={r.id} index={i} count={list.length} clickable dimmed={!!r.purchased_at}
        isOpen={openId === r.id} onOpenChange={(open) => setOpenId(open ? r.id : null)}
        onTap={() => nav(`/cart/${r.id}`)} onDelete={() => del(r)}
        // 밀면: 구매 예정은 편집·삭제, 구매 완료는 되돌리기·삭제
        onEdit={r.purchased_at ? undefined : () => nav(`/cart/${r.id}/edit`)}
        onRevert={r.purchased_at ? () => revert(r) : undefined}
      >
        <span className="tx-tile" style={{ background: tileColorOf(r) }}>{r.category_emoji || '🛒'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tx-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="ttext">{r.content || '품목'}</span>
            {/* 항목이 여러 개면 체크한 개수/전체(회색 가는 글씨) */}
            {items.length > 1 && <span style={{ flex: 'none', fontSize: 12, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>{checked}/{items.length}</span>}
            {r.purchased_at && <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-efeef2)', borderRadius: 999, padding: '2px 7px' }}>구매 완료</span>}
          </div>
          <div className="tx-row-sub">{sub}</div>
        </div>
        <span style={{ flex: 'none', fontSize: 14.5, fontWeight: 700, letterSpacing: '-.3px', color: cartHasAmount(items) ? 'var(--k-tx-191722)' : 'var(--k-tx-b0b0b8)' }}>
          {cartHasAmount(items) ? fmtNum(total) : '-'}
        </span>
      </DayCardRow>
    );
  };

  // 날짜 묶음(가계부와 같은 머리글: 왼쪽 "N 일 ㅇ요일", 오른쪽 그날 합계)
  const group = (key, label, list) => {
    const sum = list.reduce((s, r) => s + cartTotal(r.items), 0);
    const hasAmt = list.some((r) => cartHasAmount(r.items));
    return (
      <div key={key}>
        <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{label}</span>
          {hasAmt && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{fmtNum(sum)}</span>}
        </div>
        <div className="tx-daygroup">{list.map((r, i, arr) => card(r, i, arr))}</div>
      </div>
    );
  };

  return (
    <div style={{ padding: '44px 0 104px' }}>
      {/* 상단바: 가계부와 같은 제목 + 검색(필터 왼쪽에서 늘어남) + 필터 */}
      <div className="ledger-topbar">
        <div className="lt-title" style={{ opacity: searchOpen ? 0 : 1, transition: 'opacity 0.26s ease', pointerEvents: searchOpen ? 'none' : 'auto' }}>장바구니</div>
        <button aria-label="필터" className={`lt-filter${filterActive ? ' on' : ''}`} onClick={() => setShowFilter(true)}>
          <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 4 21 4 14 13 14 20 10 22 10 13 3 4" /></svg>
        </button>
        <div className={`lt-search${searchOpen ? ' open' : ''}`}>
          <button aria-label="검색" className="lt-search-icon" onClick={() => (searchOpen ? searchRef.current?.focus() : openSearch())}>
            <svg width="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></svg>
          </button>
          <form onSubmit={(e) => { e.preventDefault(); searchRef.current?.blur(); }} style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <input
              ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} type="search" enterKeyHint="search" autoComplete="off"
              placeholder="검색어 입력" tabIndex={searchOpen ? 0 : -1} onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            />
          </form>
          {searchOpen && (
            <button aria-label="닫기" className="lt-search-close" onClick={closeSearch}>
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
            </button>
          )}
        </div>
      </div>
      {showFilter && <CartFilterSheet categories={cats} filterCats={filterCats} setFilterCats={setFilterCats} status={status} setStatus={setStatus} onClose={() => setShowFilter(false)} />}

      {!searchOpen && (<>
      {/* 연월 컨트롤바(가계부와 같은 위치·모양) */}
      <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <div style={{ position: 'relative', minWidth: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)', letterSpacing: '-.2px' }}>{`${yy} 년 ${Number(mm)} 월`}</span>
          <input type="month" value={month} aria-label="연월 선택" className="catmodal-date-input" onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} />
        </div>
        <button aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))} style={roundBtn(32)}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      </div>

      {/* 이번 달 전체 지출 예산: 확정 지출(코랄 핑크) + 이 달 구매 예정(옅은 코랄 핑크, 이어서) */}
      <div style={{ marginTop: 12, background: 'var(--k-bg-fff)', borderRadius: 16, padding: '12px 14px', boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))' }}>
        {budget === undefined ? (
          <div style={{ height: 34 }} />
        ) : budget ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>지출 전체 예산</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{fmtNum(budget)}원</span>
            </div>
            <BudgetBar budget={budget} spent={spent} planned={plannedSum} color="#FF4358" />
          </>
        ) : (
          <button type="button" onClick={() => nav('/settings/budget/expense/total')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>지출 전체 예산</span>
            <span style={{ fontSize: 12, color: 'var(--k-tx-a29ead)' }}>설정하기 ›</span>
          </button>
        )}
      </div>
      </>)}

      {dates.length === 0 && undated.length === 0 ? (
        <div className="empty empty-center">{searchOpen && term ? '검색 결과가 없습니다.' : filterActive ? '조건에 맞는 품목이 없습니다.' : '장바구니가 비어 있습니다.'}</div>
      ) : (
        <>
          {/* 검색 중에는 여러 달이 섞이므로 연·월까지 표시 */}
          {dates.map((d) => group(d, formatDate(d, searchOpen ? 'full' : undefined), inMonth.filter((r) => r.planned_date === d).sort(order)))}
          {undated.length > 0 && group('undated', '미정', undated)}
        </>
      )}
      {!searchOpen && <button className="fab" onClick={() => nav('/cart/new')} aria-label="장바구니 담기">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>}
    </div>
  );
}
