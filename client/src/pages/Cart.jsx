import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, currentMonth, shiftMonth } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
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

  const load = () => db.listCartItems().then(setRows).catch((e) => { alert(e.message); setRows([]); });
  useEffect(() => { load(); db.listCategories('expense').then(setCats).catch(() => {}); }, []);

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
  const inMonth = rows.filter((r) => r.planned_date && r.planned_date.slice(0, 7) === month);
  const dates = [...new Set(inMonth.map((r) => r.planned_date))].sort();
  const undated = rows.filter((r) => !r.planned_date).sort(order);
  const [yy, mm] = month.split('-');

  const card = (r, i, list) => {
    const items = r.items || [];
    const checked = items.filter((it) => it.checked).length;
    const total = cartTotal(items);
    const sub = [r.category_name, items.length ? `항목 ${checked}/${items.length}` : ''].filter(Boolean).join(' · ') || '—';
    return (
      <DayCardRow
        key={r.id} index={i} count={list.length} clickable dimmed={!!r.purchased_at}
        isOpen={openId === r.id} onOpenChange={(open) => setOpenId(open ? r.id : null)}
        onTap={() => nav(`/cart/${r.id}`)} onDelete={() => del(r)}
      >
        <span className="tx-tile" style={{ background: tileColorOf(r) }}>{r.category_emoji || '🛒'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tx-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="ttext">{r.content || '품목'}</span>
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
      <PageHeader title="장바구니" showBack={false} />
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

      {dates.length === 0 && undated.length === 0 ? (
        <div className="empty empty-center">장바구니가 비어 있습니다.</div>
      ) : (
        <>
          {dates.map((d) => group(d, formatDate(d), inMonth.filter((r) => r.planned_date === d).sort(order)))}
          {undated.length > 0 && group('undated', '미정', undated)}
        </>
      )}
      <button className="fab" onClick={() => nav('/cart/new')} aria-label="장바구니 담기">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}
