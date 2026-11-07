import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, dotDateWithWeekday } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';
import { cartTotal, cartHasAmount } from './Cart.jsx';
import CalcAmountInput from '../components/CalcAmountInput.jsx';

// 숫자 칸: 기록 페이지 금액 키패드와 같은 규칙 — 칸을 열고 바로 숫자를 치면 기존 값을 지우고 새로 입력,
// 지우기부터 누르면 기존 숫자 끝에서 지우고 이어서 입력
function FreshNumberInput({ value, onChange, autoFocus, style }) {
  const fresh = useRef(false);
  return (
    <input
      type="text" inputMode="numeric" value={value} autoFocus={autoFocus} style={style}
      onFocus={(e) => {
        fresh.current = true;
        const el = e.target;
        requestAnimationFrame(() => { const n = el.value.length; try { el.setSelectionRange(n, n); } catch { /* ignore */ } });
      }}
      onBlur={() => { fresh.current = false; }}
      onChange={(e) => {
        let v = e.target.value.replace(/[^0-9]/g, '');
        if (fresh.current) {
          fresh.current = false;
          if (v.length > value.length) v = v.slice(value.length) || v; // 처음 친 숫자부터 새로
        }
        onChange(v);
      }}
    />
  );
}

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
  const tapRef = useRef(null);
  const [editRow, setEditRow] = useState(null); // 수량·금액 바로 수정 중인 행 { i, qty, amount, focus } // 체크 행: 누른 행·위치(손가락을 뗄 때 같은 행이면 토글)
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

  const removeItem = async () => {
    if (!confirm('이 품목을 장바구니에서 삭제할까요?')) return;
    clearTimeout(saveTimer.current); saveTimer.current = 0; latestItems.current = null;
    try { await db.deleteCartItem(r.id); nav(-1); } catch (e) { alert(e.message); }
  };
  const startEdit = (i, focus) => {
    const it = items[i];
    setEditRow({ i, focus, qty: String(it.qty || 1), amount: it.amount != null ? String(it.amount) : '', wasNull: it.amount == null });
  };
  const commitEdit = () => {
    const e = editRow;
    if (!e) return;
    const qty = Math.max(Number(e.qty) || 1, 1);
    // 금액을 비우거나, 원래 "미정"이던 칸을 열었다가 0 으로 닫으면 그대로 미정
    const amount = e.amount === '' || (e.wasNull && Number(e.amount) === 0) ? null : Math.round(Number(e.amount));
    setR((prev) => {
      const next = (prev.items || []).map((it, j) => (j === e.i ? { ...it, qty, amount } : it));
      latestItems.current = next;
      return { ...prev, items: next };
    });
    setEditRow(null);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = 0;
      const snapshot = latestItems.current;
      saving.current = saving.current.then(() => db.updateCartChecks(Number(id), snapshot)).catch((err) => { alert(err.message); load(); });
    }, 0);
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
        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="tb-icon-btn" onClick={() => nav(`/cart/${r.id}/edit`)} aria-label="품목 수정">
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          <button className="tb-icon-btn" onClick={removeItem} aria-label="품목 삭제">
            <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
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
              <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.link_name || r.content || r.link}</span>
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
            {items.map((it, i) => {
              const ed = editRow?.i === i ? editRow : null;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: ed ? '24px 1fr 40px 76px auto' : '24px 1fr 40px 84px', gap: 8, alignItems: 'center', padding: '8px 0', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent' }}>
                  {/* 체크 + 항목명: 누르면 체크(빠르게 연달아 눌러도 그 행만 — pointerup 기준) */}
                  <div
                    role="checkbox" aria-checked={!!it.checked} tabIndex={0}
                    onPointerDown={(e) => { tapRef.current = { i, x: e.clientX, y: e.clientY }; }}
                    onPointerUp={(e) => {
                      const t = tapRef.current; tapRef.current = null;
                      if (!t || t.i !== i || Math.abs(e.clientX - t.x) > 10 || Math.abs(e.clientY - t.y) > 10) return;
                      toggle(i);
                    }}
                    onPointerCancel={() => { tapRef.current = null; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(i); } }}
                    style={{ gridColumn: '1 / 3', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, alignItems: 'center', cursor: 'pointer', minWidth: 0 }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: '50%', border: it.checked ? 'none' : '1.5px solid var(--k-bd-cfccd4)', background: it.checked ? 'var(--k-bg-191722)' : 'transparent', color: 'var(--k-onink-fff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {it.checked && <svg width="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg>}
                    </span>
                    <span style={{ fontSize: 13.5, color: it.checked ? 'var(--k-tx-a29ead)' : 'var(--k-tx-191722)', textDecoration: it.checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || '-'}</span>
                  </div>
                  {ed ? (
                    <>
                      {/* 수정 모드: 수량·금액 바로 수정(기록 페이지처럼 열자마자 숫자를 치면 새로, 지우기부터 누르면 이어서) */}
                      <FreshNumberInput value={ed.qty} autoFocus={ed.focus === 'qty'} onChange={(v) => setEditRow((e) => ({ ...e, qty: v }))}
                        style={{ width: '100%', minWidth: 0, border: 'none', borderBottom: '1.5px solid var(--k-bd-cfccd4)', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--k-tx-191722)', outline: 'none', textAlign: 'center', padding: '2px 0' }} />
                      <div style={{ borderBottom: '1.5px solid var(--k-bd-cfccd4)', padding: '2px 0' }}>
                        <CalcAmountInput compact value={ed.amount} placeholder="미정" autoFocus={ed.focus === 'amount'} onChange={(v) => setEditRow((e) => ({ ...e, amount: v }))} />
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <button type="button" aria-label="수정 취소" onClick={() => setEditRow(null)} style={{ width: 26, height: 26, border: 'none', background: 'transparent', color: 'var(--k-tx-b0b0b8)', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
                        </button>
                        <button type="button" aria-label="수정 완료" onClick={commitEdit} style={{ width: 26, height: 26, border: 'none', background: 'transparent', color: '#2CDDB9', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4.5 12.5 9.5 17.5 19.5 7" /></svg>
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span role="button" onClick={() => startEdit(i, 'qty')} style={{ fontSize: 13.5, textAlign: 'center', color: 'var(--k-tx-4a4652)', cursor: 'text' }}>{it.qty || 1}</span>
                      <span role="button" onClick={() => startEdit(i, 'amount')} style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', color: it.amount != null ? 'var(--k-tx-191722)' : 'var(--k-tx-b0b0b8)', cursor: 'text' }}>{it.amount != null ? fmtNum(it.amount) : '미정'}</span>
                    </>
                  )}
                </div>
              );
            })}
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
