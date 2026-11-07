import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, dotDateWithWeekday } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';
import { cartTotal, cartHasAmount } from './Cart.jsx';

// 장바구니 품목 상세: 상단바에 내용(+ 구매 완료 배지), 본문에 입력 내용과 항목 체크리스트(누르는 즉시 저장).
// 맨 아래 "가계부 작성" → 지출 기록 폼(내용·분류·항목·금액·메모·날짜를 채워서). 저장하면 구매 완료로 표시.
const withScheme = (v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v);

export default function CartDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [r, setR] = useState(null);

  const load = () => db.getCartItem(Number(id)).then(setR).catch((e) => { alert(e.message); nav(-1); });
  useEffect(() => { load(); }, [id]);

  if (!r) return <Spinner />;
  const items = r.items || [];
  const purchased = !!r.purchased_at;

  const toggle = async (i) => {
    const next = items.map((it, j) => (j === i ? { ...it, checked: !it.checked } : it));
    setR((prev) => ({ ...prev, items: next }));
    try { await db.updateCartChecks(r.id, next); } catch (e) { alert(e.message); load(); }
  };

  // 기록 폼으로: 즐겨찾기 템플릿과 같은 경로(location.state.favorite)로 채운다. 날짜·금액이 비어 있으면 직접 입력
  const writeLedger = () => {
    nav('/new', {
      state: {
        favorite: {
          type: 'expense', content: r.content,
          category_id: r.category_id, category_name: r.category_name, category_emoji: r.category_emoji,
          amount: cartHasAmount(items) ? cartTotal(items) : null,
          items: items.map((it) => ({ name: it.name || '', qty: Number(it.qty) || 1, amount: it.amount != null ? Number(it.amount) : null })),
          memo: r.memo || '',
          ...(r.planned_date ? { date: r.planned_date } : {}),
        },
        cartId: r.id,
        blankDate: !r.planned_date,
      },
    });
  };

  const row = (label, value, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
      <span style={{ width: 70, flex: 'none', fontSize: 13.5, color: 'var(--k-tx-8b8798)' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: 'var(--k-tx-191722)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...extra }}>{value}</span>
    </div>
  );
  const href = withScheme((r.link || '').trim());

  return (
    <div style={{ padding: '44px 0 32px' }}>
      <div className="simple-topbar flat">
        <button className="tb-icon-btn" onClick={() => nav(-1)} aria-label="뒤로">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <div className="title" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content || '품목'}</span>
          {purchased && <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: 0, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-efeef2)', borderRadius: 999, padding: '3px 8px' }}>구매 완료</span>}
        </div>
        <div className="topbar-right">
          <button className="tb-icon-btn" onClick={() => nav(`/cart/${r.id}/edit`)} aria-label="품목 수정">
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        </div>
      </div>

      <div className="rcpt-card" style={{ marginTop: 6 }}>
        {row('구매 예정일', r.planned_date ? dotDateWithWeekday(r.planned_date) : '미정', r.planned_date ? {} : { color: 'var(--k-tx-a29ead)', fontWeight: 400 })}
        {row('분류', r.category_name ? `${r.category_emoji ? `${r.category_emoji} ` : ''}${r.category_name}` : '-')}
        {r.link && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
            <span style={{ width: 70, flex: 'none', fontSize: 13.5, color: 'var(--k-tx-8b8798)' }}>링크</span>
            <a href={href} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>{r.link}</a>
          </div>
        )}

        {/* 항목 체크리스트(장볼 때) — 누르면 바로 저장 */}
        {items.length > 0 && (
          <div style={{ padding: '6px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 40px 84px', gap: 8, padding: '8px 0', borderTop: '1px dashed var(--k-bd-cfccd4)', borderBottom: '1px dashed var(--k-bd-cfccd4)', fontSize: 13.5, color: 'var(--k-tx-8b8798)' }}>
              <span /><span>항목</span><span style={{ textAlign: 'center' }}>수량</span><span style={{ textAlign: 'right' }}>금액</span>
            </div>
            {items.map((it, i) => (
              <div key={i} role="button" onClick={() => toggle(i)} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 40px 84px', gap: 8, alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}>
                <span aria-label={it.checked ? '체크 해제' : '체크'} style={{ width: 20, height: 20, borderRadius: '50%', border: it.checked ? 'none' : '1.5px solid var(--k-bd-cfccd4)', background: it.checked ? 'var(--k-bg-191722)' : 'transparent', color: 'var(--k-onink-fff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {it.checked && <svg width="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg>}
                </span>
                <span style={{ fontSize: 13.5, color: it.checked ? 'var(--k-tx-a29ead)' : 'var(--k-tx-191722)', textDecoration: it.checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || '-'}</span>
                <span style={{ fontSize: 13.5, textAlign: 'center', color: 'var(--k-tx-4a4652)' }}>{it.qty || 1}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', color: it.amount != null ? 'var(--k-tx-191722)' : 'var(--k-tx-b0b0b8)' }}>{it.amount != null ? fmtNum(it.amount) : '미정'}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 40px 84px', gap: 8, alignItems: 'center', padding: '8px 0 0', marginTop: 6, borderTop: '1px dashed var(--k-bd-cfccd4)' }}>
              <span /><span style={{ fontSize: 13.5, color: 'var(--k-tx-8b8798)' }}>합계</span><span />
              <span style={{ fontSize: 13.75, fontWeight: 800, textAlign: 'right', color: cartHasAmount(items) ? '#FF4358' : 'var(--k-tx-b0b0b8)' }}>{cartHasAmount(items) ? fmtNum(cartTotal(items)) : '미정'}</span>
            </div>
          </div>
        )}

        {r.memo && (
          <>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="rcpt-dots" />
              <span style={{ flex: 'none', fontSize: 13.5, color: 'var(--k-tx-a29ead)', letterSpacing: '.3px' }}>메모</span>
              <span className="rcpt-dots" style={{ textAlign: 'right' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5, color: 'var(--k-tx-191722)', whiteSpace: 'pre-wrap' }}>{r.memo}</div>
          </>
        )}
      </div>

      {!purchased && (
        <button type="button" className="btn-ink-pill" style={{ marginTop: 26 }} onClick={writeLedger}>가계부 작성</button>
      )}
    </div>
  );
}
