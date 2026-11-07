import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { fmtNum, dotDateWithWeekday } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';
import { cartTotal } from './Cart.jsx';
import { fieldStyle, labelStyle } from './FriendAdd.jsx';

// 장바구니 담기 / 품목 수정: 기록 페이지와 같은 영수증 카드 모양.
// 내용 · 구매 예정일(비우면 "미정") · 분류 · 링크 · 항목/수량(기본 1)/금액(비워도 됨) · 메모
const emptyRow = () => ({ name: '', qty: '1', amount: '', checked: false });

export default function CartEdit() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const [cats, setCats] = useState([]);
  const [f, setF] = useState(editing ? null : { content: '', planned_date: '', categoryId: '', link: '', linkName: '', showThumb: false, thumbUrl: '', memo: '', rows: [emptyRow()] });
  const [linkModal, setLinkModal] = useState(null); // 하이퍼링크 모달 입력값 { url, name, thumb } | null
  const [linkBusy, setLinkBusy] = useState(false);
  const [orig, setOrig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const contentRef = useRef(null);
  // 대표 "내용" ↔ 첫 번째 항목 이름: 한쪽을 먼저 입력하면 다른 쪽도 같은 글자로 채움(기록 페이지와 동일).
  // 다른 쪽을 직접 고치면 그때부터는 따로 감(수정 화면은 이미 채워진 쪽을 직접 입력한 것으로 봄)
  const contentTouched = useRef(false);
  const itemTouched = useRef(false);
  const memoRef = useRef(null);
  const showToast = (m) => { setToast(m); setToastKey((k) => k + 1); };
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast, toastKey]);

  useEffect(() => { db.listCategories('expense').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    if (!editing) { contentRef.current?.focus({ preventScroll: true }); return; }
    db.getCartItem(Number(id)).then((r) => {
      setOrig(r);
      contentTouched.current = !!r.content;
      itemTouched.current = !!r.items?.[0]?.name;
      setF({
        content: r.content || '', planned_date: r.planned_date || '', categoryId: r.category_id ? String(r.category_id) : '',
        link: r.link || '', linkName: r.link_name || '', showThumb: !!r.show_thumb, thumbUrl: r.thumb_url || '', memo: r.memo || '',
        rows: (r.items || []).length ? r.items.map((it) => ({ name: it.name || '', qty: String(it.qty || 1), amount: it.amount != null ? String(it.amount) : '', checked: !!it.checked })) : [emptyRow()],
      });
    }).catch((e) => { alert(e.message); nav(-1); });
  }, [id]);
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`;
  }, [f?.memo]);

  if (!f) return <Spinner />;
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const setRow = (i, patch) => setF((p) => ({ ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const rowsForSave = f.rows
    .filter((r) => r.name.trim() || r.amount !== '')
    .map((r) => ({ name: r.name.trim(), qty: Math.max(Number(r.qty) || 1, 1), amount: r.amount === '' ? null : Math.round(Number(r.amount)), checked: !!r.checked }));
  const total = cartTotal(rowsForSave);
  const hasAmount = rowsForSave.some((r) => r.amount != null);

  // 하이퍼링크 확인: 썸네일 표시가 켜져 있으면 페이지의 대표 이미지를 가져옴(링크명을 비우면 상세 화면에서 "내용"으로 표시)
  const applyLink = async () => {
    const url = linkModal.url.trim();
    if (!url) { showToast('URL을 입력해 주세요'); return; }
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let thumbUrl = normalized === f.link ? f.thumbUrl : '';
    const name = linkModal.name.trim();
    if (linkModal.thumb && !thumbUrl) {
      setLinkBusy(true);
      try {
        const pv = await db.linkPreview(normalized);
        thumbUrl = pv.image;
        if (!thumbUrl) showToast('썸네일 이미지를 찾지 못했어요');
      } catch (err) {
        showToast(err.message);
      } finally { setLinkBusy(false); }
    }
    set({ link: normalized, linkName: name, showThumb: linkModal.thumb, thumbUrl });
    setLinkModal(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!f.content.trim()) { showToast('내용을 입력해 주세요'); contentRef.current?.focus(); return; }
    if (busy) return;
    setBusy(true);
    const cat = cats.find((c) => String(c.id) === f.categoryId);
    try {
      await db.saveCartItem(editing ? Number(id) : null, {
        content: f.content, planned_date: f.planned_date || null,
        category_id: cat ? cat.id : null,
        category_name: cat ? cat.name : (f.categoryId === 'KEEP' ? orig?.category_name : ''),
        category_emoji: cat ? (cat.emoji || '') : (f.categoryId === 'KEEP' ? orig?.category_emoji : ''),
        link: f.link, link_name: f.linkName, show_thumb: f.showThumb, thumb_url: f.thumbUrl, items: rowsForSave, memo: f.memo,
      });
      nav(-1);
    } catch (err) { alert(err.message); setBusy(false); }
  };

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' };
  const rowLabelStyle = { width: 70, flex: 'none', fontSize: 13.5, fontWeight: 400, color: 'var(--k-tx-8b8798)' };
  const rowInputStyle = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: 'var(--k-tx-191722)', outline: 'none', textAlign: 'right', padding: 0 };
  const cellInput = { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--k-tx-191722)', outline: 'none', minWidth: 0, padding: 0 };
  const grid = { display: 'grid', gridTemplateColumns: '1fr 40px 84px 18px', gap: 8, alignItems: 'center' };
  const head = { fontSize: 13.5, fontWeight: 400, color: 'var(--k-tx-8b8798)' };
  const catSel = cats.some((c) => String(c.id) === f.categoryId) ? f.categoryId : (orig?.category_name && !f.categoryId ? 'KEEP' : f.categoryId);

  return (
    <div style={{ padding: '44px 0 32px' }}>
      <div className="simple-topbar flat">
        <button className="tb-icon-btn" onClick={() => nav(-1)} aria-label="닫기">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
        </button>
        <div className="title">{editing ? '품목 수정' : '장바구니 담기'}</div>
      </div>

      <form onSubmit={save} style={{ paddingTop: 6 }}>
        <div className="rcpt-card">
          <div style={{ paddingBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={contentRef} type="text" value={f.content} placeholder="내용"
              onChange={(e) => {
                const v = e.target.value;
                contentTouched.current = true;
                setF((p) => ({ ...p, content: v, rows: itemTouched.current ? p.rows : p.rows.map((r, j) => (j === 0 ? { ...r, name: v } : r)) }));
              }}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 20, fontWeight: 800, color: 'var(--k-tx-191722)', outline: 'none', padding: 0 }}
            />
            {/* 하이퍼링크(상품 페이지 등) — 아이콘만. 옅은 회색, 링크가 있으면 먹색 */}
            <button
              type="button" aria-label="하이퍼링크" onClick={() => setLinkModal({ url: f.link, name: f.linkName, thumb: f.showThumb })}
              style={{ flex: 'none', width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: f.link ? 'var(--k-tx-191722)' : 'var(--k-tx-c7c3cc)' }}
            >
              <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
            </button>
          </div>

          <div style={rowStyle}>
            <span style={rowLabelStyle}>구매 예정일</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: f.planned_date ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>{f.planned_date ? dotDateWithWeekday(f.planned_date) : '미정'}</span>
                <input type="date" value={f.planned_date} onChange={(e) => set({ planned_date: e.target.value })} className="catmodal-date-input" aria-label="구매 예정일 선택" />
              </div>
              {f.planned_date && (
                <button type="button" aria-label="구매 예정일 지우기" onClick={() => set({ planned_date: '' })}
                  style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'var(--k-bg-e4e2e7)', color: '#fff', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
                  <svg width="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                </button>
              )}
            </div>
          </div>

          <div style={rowStyle}>
            <span style={rowLabelStyle}>분류</span>
            <select value={catSel} onChange={(e) => set({ categoryId: e.target.value })} style={{ ...rowInputStyle, appearance: 'none', textAlignLast: 'right', fontWeight: catSel ? 600 : 400, color: catSel ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
              <option value="">선택 안 함</option>
              {catSel === 'KEEP' && <option value="KEEP">{orig?.category_emoji ? `${orig.category_emoji} ` : ''}{orig?.category_name} (기존)</option>}
              {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
            </select>
          </div>

          {/* 항목 / 수량 / 금액(1개 가격, 비워도 됨) */}
          <div style={{ padding: '6px 0' }}>
            <div style={{ ...grid, padding: '8px 0', borderTop: '1px dashed var(--k-bd-cfccd4)', borderBottom: '1px dashed var(--k-bd-cfccd4)' }}>
              <span style={head}>항목</span><span style={{ ...head, textAlign: 'center' }}>수량</span><span style={{ ...head, textAlign: 'right' }}>금액</span><span />
            </div>
            {f.rows.map((r, i) => (
              <div key={i} style={{ ...grid, padding: '5px 0' }}>
                <input
                  type="text" placeholder="항목 기입" value={r.name} style={cellInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (i !== 0) { setRow(i, { name: v }); return; }
                    itemTouched.current = true;
                    setF((p) => ({ ...p, content: contentTouched.current ? p.content : v, rows: p.rows.map((row, j) => (j === 0 ? { ...row, name: v } : row)) }));
                  }}
                />
                <input type="text" inputMode="numeric" placeholder="1" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value.replace(/[^0-9]/g, '') })} style={{ ...cellInput, textAlign: 'center' }} />
                <input
                  type="text" inputMode="numeric" placeholder="미정" value={r.amount === '' ? '' : fmtNum(r.amount)}
                  onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '') })}
                  style={{ ...cellInput, textAlign: 'right', fontWeight: 600 }}
                />
                {f.rows.length > 1 ? (
                  <button type="button" aria-label="행 삭제" onClick={() => setF((p) => ({ ...p, rows: p.rows.filter((_, j) => j !== i) }))} style={{ width: 18, height: 18, border: 'none', background: 'transparent', color: 'var(--k-tx-c2bfc6)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
                  </button>
                ) : <span />}
              </div>
            ))}
            <button type="button" onClick={() => setF((p) => ({ ...p, rows: [...p.rows, emptyRow()] }))} className="rcpt-add-row">+ 행 추가</button>
            <div style={{ ...grid, padding: '8px 0 0', marginTop: 6, borderTop: '1px dashed var(--k-bd-cfccd4)' }}>
              <span style={head}>합계</span><span /><span style={{ fontSize: 13.75, fontWeight: 800, color: hasAmount ? '#FF4358' : 'var(--k-tx-b0b0b8)', textAlign: 'right' }}>{hasAmount ? fmtNum(total) : '미정'}</span><span />
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="rcpt-dots" />
            <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 400, color: 'var(--k-tx-a29ead)', letterSpacing: '.3px' }}>메모</span>
            <span className="rcpt-dots" style={{ textAlign: 'right' }} />
          </div>
          <textarea
            ref={memoRef} value={f.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="추가 설명을 적어주세요" rows={2}
            style={{ marginTop: 8, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: 'var(--k-tx-191722)', outline: 'none', resize: 'none', padding: 0, overflow: 'hidden' }}
          />
        </div>

        <button className="btn-ink-pill" style={{ marginTop: 26 }} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </form>
      {linkModal && (
        <div className="catmodal-overlay" onClick={() => !linkBusy && setLinkModal(null)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>하이퍼링크</div>
              <button aria-label="닫기" onClick={() => setLinkModal(null)} className="catmodal-icon-btn" disabled={linkBusy}>
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={labelStyle}>URL <span style={{ color: '#FF3B5C' }}>*</span></span>
              <input type="url" inputMode="url" autoFocus value={linkModal.url} onChange={(e) => setLinkModal({ ...linkModal, url: e.target.value })} placeholder="https://" style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={labelStyle}>링크명</span>
              <input type="text" value={linkModal.name} onChange={(e) => setLinkModal({ ...linkModal, name: e.target.value })} placeholder="링크 이름 입력" style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
              <span style={labelStyle}>썸네일 표시</span>
              <button type="button" role="switch" aria-checked={linkModal.thumb} aria-label="썸네일 표시" className={`ios-toggle${linkModal.thumb ? ' on' : ''}`} onClick={() => setLinkModal({ ...linkModal, thumb: !linkModal.thumb })}>
                <span className="ios-toggle-knob" />
              </button>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {f.link && (
                <button type="button" disabled={linkBusy} onClick={() => { set({ link: '', linkName: '', showThumb: false, thumbUrl: '' }); setLinkModal(null); }}
                  style={{ flex: 1, height: 42, border: 'none', borderRadius: 999, background: 'var(--k-bg-f4f2f0)', color: '#FF3B5C', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>삭제</button>
              )}
              <button type="button" disabled={linkBusy} onClick={applyLink}
                style={{ flex: 1, height: 42, border: 'none', borderRadius: 999, background: 'var(--k-bg-191722)', color: 'var(--k-onink-fff)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{linkBusy ? '불러오는 중…' : '확인'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
    </div>
  );
}
