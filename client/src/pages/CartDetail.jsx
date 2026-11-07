import { useEffect, useRef, useState } from 'react';
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
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast, toastKey]);
  // 체크 저장: 화면은 즉시 바꾸고, 저장은 마지막 상태만 모아서(연달아 눌러도 앞의 체크가 되돌아가지 않게)
  const latestItems = useRef(null);
  const saveTimer = useRef(0);
  const saving = useRef(Promise.resolve());
  useEffect(() => () => {
    // 화면을 떠날 때 남은 저장이 있으면 바로 저장
    if (saveTimer.current && latestItems.current) { clearTimeout(saveTimer.current); db.updateCartChecks(Number(id), latestItems.current).catch(() => {}); }
  }, [id]);

  const load = () => db.getCartItem(Number(id)).then(setR).catch((e) => { alert(e.message); nav(-1); });
  useEffect(() => { load(); }, [id]);

  if (!r) return <Spinner />;
  const items = r.items || [];
  const purchased = !!r.purchased_at;

  const toggle = (i) => {
    setR((prev) => {
      const next = (prev.items || []).map((it, j) => (j === i ? { ...it, checked: !it.checked } : it));
      latestItems.current = next;
      return { ...prev, items: next };
    });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = 0;
      const snapshot = latestItems.current;
      // 저장은 순서대로(이전 저장이 끝난 뒤 다음 저장)
      saving.current = saving.current.then(() => db.updateCartChecks(Number(id), snapshot)).catch((e) => { alert(e.message); load(); });
    }, 350);
  };

  // 기록 폼으로: 즐겨찾기 템플릿과 같은 경로(location.state.favorite)로 채운다. 날짜·금액이 비어 있으면 직접 입력
  const writeLedger = () => {
    // 체크한 항목만 가계부로(항목이 없는 품목은 그대로)
    const bought = items.length ? items.filter((it) => it.checked) : [];
    if (items.length && !bought.length) { setToast('구매한 항목을 체크해 주세요'); setToastKey((k) => k + 1); return; }
    nav('/new', {
      state: {
        favorite: {
          type: 'expense', content: r.content,
          category_id: r.category_id, category_name: r.category_name, category_emoji: r.category_emoji,
          amount: cartHasAmount(bought) ? cartTotal(bought) : null,
          items: bought.map((it) => ({ name: it.name || '', qty: Number(it.qty) || 1, amount: it.amount != null ? Number(it.amount) : null })),
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
        {/* 하이퍼링크: 썸네일(켜 둔 경우) + 링크 아이콘·링크명 — 어디를 눌러도 링크로 이동 */}
        {r.link && (
          <div style={{ paddingBottom: 8 }}>
            {r.show_thumb && r.thumb_url && (
              <a href={href} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 10 }}>
                <img src={r.thumb_url} alt="" referrerPolicy="no-referrer" loading="lazy"
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                  style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 14, background: 'var(--k-bg-f4f2f0)' }} />
              </a>
            )}
            <a href={href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--k-tx-4a4652)', textDecoration: 'none', minWidth: 0 }}>
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
              <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.link_name || r.link}</span>
            </a>
          </div>
        )}
        {row('구매 예정일', r.planned_date ? dotDateWithWeekday(r.planned_date) : '미정', r.planned_date ? {} : { color: 'var(--k-tx-a29ead)', fontWeight: 400 })}
        {row('분류', r.category_name ? `${r.category_emoji ? `${r.category_emoji} ` : ''}${r.category_name}` : '-')}

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

      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
      {!purchased && (
        <button type="button" className="btn-ink-pill" style={{ marginTop: 26 }} onClick={writeLedger}>가계부 작성</button>
      )}
    </div>
  );
}
