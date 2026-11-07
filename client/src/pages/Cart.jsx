import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { DayCardRow, tileBg } from '../components/TransactionList.jsx';

// 장바구니(하단 탭): 앞으로 살 품목을 담아 두고 지출 계획을 세우는 목록.
// 구매 예정(예정일 빠른 순, 미정은 뒤) / 구매 완료(최근 순)로 나눠 보여 준다.
export const cartTotal = (items) => (items || []).reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.qty) || 1), 0);
export const cartHasAmount = (items) => (items || []).some((it) => it.amount != null && it.amount !== '');

export default function Cart() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = () => db.listCartItems().then(setRows).catch((e) => { alert(e.message); setRows([]); });
  useEffect(() => { load(); }, []);

  const del = async (r) => {
    if (!confirm(`'${r.content || '품목'}'을(를) 장바구니에서 삭제할까요?`)) return;
    try { await db.deleteCartItem(r.id); load(); } catch (e) { alert(e.message); }
  };

  if (!rows) return <Spinner />;
  const planned = rows.filter((r) => !r.purchased_at).sort((a, b) => {
    if (!a.planned_date !== !b.planned_date) return a.planned_date ? -1 : 1;
    return (a.planned_date || '').localeCompare(b.planned_date || '') || b.id - a.id;
  });
  const done = rows.filter((r) => r.purchased_at).sort((a, b) => (b.purchased_at || '').localeCompare(a.purchased_at || ''));

  const card = (r, i, list) => {
    const items = r.items || [];
    const checked = items.filter((it) => it.checked).length;
    const total = cartTotal(items);
    const sub = [r.planned_date ? dotDate(r.planned_date) : '미정', r.category_name, items.length ? `항목 ${checked}/${items.length}` : ''].filter(Boolean).join(' · ');
    return (
      <DayCardRow
        key={r.id} index={i} count={list.length} clickable dimmed={!!r.purchased_at}
        isOpen={openId === r.id} onOpenChange={(open) => setOpenId(open ? r.id : null)}
        onTap={() => nav(`/cart/${r.id}`)} onDelete={() => del(r)}
      >
        <span className="tx-tile" style={{ background: r.category_emoji ? tileBg(r.category_name) : 'var(--k-bg-f2f1f5)' }}>{r.category_emoji || '🛒'}</span>
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

  const section = (label, list, first) => list.length > 0 && (
    <div style={{ marginTop: first ? 14 : 24 }}>
      <div style={{ padding: '0 8px 0 18px', marginBottom: 8, fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>
        {label} <span style={{ fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>{list.length}</span>
      </div>
      <div className="tx-daygroup">{list.map((r, i) => card(r, i, list))}</div>
    </div>
  );

  return (
    <div style={{ padding: '44px 0 104px' }}>
      <PageHeader title="장바구니" showBack={false} />
      {rows.length === 0 ? (
        <div className="empty empty-center">장바구니가 비어 있습니다.</div>
      ) : (
        <>
          {section('구매 예정', planned, true)}
          {section('구매 완료', done, planned.length === 0)}
        </>
      )}
      <button className="fab" onClick={() => nav('/cart/new')} aria-label="장바구니 담기">
        <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}
