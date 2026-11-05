import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { useDragReorder } from '../lib/useDragReorder.js';
import PageHeader from '../components/PageHeader.jsx';
import { tileBg, DayCardRow } from '../components/TransactionList.jsx';

// 통계 페이지 원형 그래프 팔레트(Stats.jsx 의 PALETTE)를 흰색 85% 비율로 섞어 훨씬 연하게 만든 색.
const PALETTE = ['#FFE9EF', '#FDF1E2', '#E6F0F9', '#EEECFC', '#DFFAF5', '#FFFBFB', '#FFF4F1', '#F0F8F6', '#F6F2FC', '#ECF4F9', '#FFF7E4', '#E9F8EB', '#FBEEF6'];

// 수입 "정산"은 정산 로직이 이름으로 찾는 분류라 항상 고정
const IS_SETTLE = (c, type) => (c.type || type) === 'income' && c.name === '정산';
// 고정 항목(0079 locked): 삭제·이름 변경 불가. 관리자는 분류 기본값 관리에서 토글로 지정.
const LOCKED = (c, type) => !!c.locked || IS_SETTLE(c, type);

// admin=true: 관리자 > 기타 관리 > 분류 기본값 관리(새 가입자에게 만들어 줄 분류). 수입/지출 탭으로 전환.
export default function CategoryManage({ admin = false }) {
  const params = useParams(); // income | expense
  const [adminType, setAdminType] = useState('expense');
  const type = admin ? adminType : params.type;
  const { user } = useAuth();
  const api = admin ? {
    list: (t) => db.listDefaultCategories(t),
    add: (t, name, emoji, color, locked) => db.addDefaultCategory(t, name, emoji, color, locked),
    update: (id, patch) => db.updateDefaultCategory(id, patch),
    remove: (id) => db.deleteDefaultCategory(id),
    reorder: (ids) => db.reorderDefaultCategories(ids),
  } : {
    list: (t) => db.listCategories(t),
    add: (t, name, emoji, color) => db.addCategory(user.id, t, name, emoji, color),
    update: (id, patch) => db.updateCategory(id, patch),
    remove: (id) => db.deleteCategory(id),
    reorder: (ids) => db.reorderCategories(ids),
  };
  const [categories, setCategories] = useState([]);
  const [editor, setEditor] = useState(null); // null | {id?, name, emoji, color}
  const [openId, setOpenId] = useState(null); // 스와이프로 열린 카드(하나만)
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const showToast = (m) => { setToast(m); setToastKey((k) => k + 1); setOpenId(null); };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2000); return () => clearTimeout(t); }, [toast, toastKey]);

  const kind = type === 'income' ? '수입' : '지출';
  const valid = type === 'income' || type === 'expense';

  const load = useCallback(() => {
    if (!valid) return;
    api.list(type).then(setCategories).catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, valid, admin]);
  useEffect(() => { load(); }, [load]);

  // editor.locked: 고정 항목 여부(관리자: 토글로 변경, 사용자: 이름 수정 불가)
  // editor.settle: 수입 "정산"(항상 고정, 관리자도 이름·고정 해제 불가)
  const openAdd = () => setEditor({ name: '', emoji: '💰', color: PALETTE[0], locked: false, settle: false });
  const openEdit = (c) => setEditor({ id: c.id, locked: LOCKED(c, type), settle: IS_SETTLE(c, type), name: c.name, emoji: c.emoji || '', color: c.color || tileBg(c.name) });
  // 이름 입력 잠금: 사용자는 고정 항목, 관리자는 "정산"만
  const nameDisabled = !!editor?.id && (admin ? editor.settle : editor.locked);
  const closeModal = () => setEditor(null);

  const save = async () => {
    const name = editor.name.trim();
    if (!name) return closeModal();
    try {
      if (editor.id) {
        await api.update(editor.id, {
          ...(nameDisabled ? {} : { name }), emoji: editor.emoji, color: editor.color,
          ...(admin ? { locked: editor.settle || !!editor.locked } : {}),
        });
      } else await api.add(type, name, editor.emoji, editor.color, admin && !!editor.locked);
      closeModal(); load();
    } catch (e) { alert(e.message); }
  };
  const del = async (c) => {
    if (!confirm(`'${c.name}' 분류를 삭제할까요?`)) return;
    try { await api.remove(c.id); setOpenId(null); load(); } catch (e) { alert(e.message); }
  };

  const { dragId, setRowRef, startDrag } = useDragReorder(categories, setCategories, async (ids) => {
    try { await api.reorder(ids); } catch (e) { alert(e.message); load(); }
  });

  if (!valid) return <div className="empty">잘못된 접근입니다.</div>;

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={admin ? '분류 기본값 관리' : `${kind} 분류 관리`} flat right={
        <button className="tb-icon-btn" onClick={openAdd} aria-label="추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {admin && (
        // 수입/지출 탭
        <div style={{ marginTop: 8, display: 'flex', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: 4 }}>
          {[['income', '수입'], ['expense', '지출']].map(([t, label]) => (
            <button key={t} type="button" onClick={() => setAdminType(t)} style={{
              flex: 1, border: 'none', borderRadius: 999, padding: '11px 0', fontFamily: 'inherit', fontSize: 13.25, fontWeight: 700, cursor: 'pointer',
              background: type === t ? 'var(--k-bg-fff)' : 'transparent', color: type === t ? 'var(--k-tx-191722)' : 'var(--k-tx-8b8798)',
            }}>{label}</button>
          ))}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="tx-daycard">
          <div className="empty" style={{ padding: '20px 0' }}>분류가 없습니다.</div>
        </div>
      ) : (
        // 카드를 누르면 수정, 왼쪽으로 밀면 삭제(수입 "정산"은 삭제 불가 — 빗금 버튼 + 토스트)
        <div className="tx-daygroup">
          {categories.map((c, i) => {
            const locked = LOCKED(c, type);
            return (
              <div key={c.id} ref={setRowRef(c.id)} className={dragId === c.id ? 'drag-lift' : ''}>
                <DayCardRow
                  index={i} count={categories.length} clickable
                  isOpen={openId === c.id} onOpenChange={(o) => setOpenId(o ? c.id : null)}
                  onTap={() => openEdit(c)}
                  onDelete={locked ? () => showToast(admin && !IS_SETTLE(c, type) ? '고정 항목은 삭제할 수 없습니다' : `${c.name} 분류는 삭제할 수 없습니다`) : () => del(c)} deleteBlocked={locked}
                >
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 12, background: c.color || tileBg(c.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16.5, flex: 'none' }}>{c.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.75, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{c.name}</span>
                    <span
                      className="cat-drag-handle" aria-label="순서 변경"
                      onPointerDown={(e) => { e.stopPropagation(); startDrag(c.id)(e); }} onClick={(e) => e.stopPropagation()}
                      style={{ touchAction: 'none', cursor: dragId === c.id ? 'grabbing' : 'grab' }}
                    >
                      <svg width="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                    </span>
                  </div>
                </DayCardRow>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}

      {editor && (
        <div className="catmodal-overlay" onClick={closeModal}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{editor.id ? `${kind} 분류 수정` : `${kind} 분류 추가`}</div>
              <button aria-label="닫기" onClick={closeModal} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flex: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: editor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, pointerEvents: 'none' }}>{editor.emoji}</div>
                <input
                  type="text" value={editor.emoji} maxLength={2} autoFocus
                  onChange={(e) => setEditor({ ...editor, emoji: [...e.target.value].slice(-1).join('') })}
                  className="catmodal-emoji-input"
                />
              </div>
              <input
                type="text" placeholder="분류 이름" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} disabled={nameDisabled}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                className="catmodal-name-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '10px 8px' }}>
              {PALETTE.map((sw) => (
                <button
                  type="button" key={sw} aria-label={sw} onClick={() => setEditor({ ...editor, color: sw })}
                  className="catmodal-swatch"
                  style={{ background: sw, border: editor.color === sw ? '2px solid var(--k-bd-191722)' : '1.5px solid var(--k-bd-e4e2e6)', boxShadow: editor.color === sw ? '0 0 0 3px var(--k-bd-efeef2)' : 'none' }}
                />
              ))}
              <label className="catmodal-swatch catmodal-custom-swatch">
                <input type="color" value={editor.color} onChange={(e) => setEditor({ ...editor, color: e.target.value })} style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 0 }} />
                <svg width="13" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.4" strokeLinecap="round" style={{ pointerEvents: 'none' }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </label>
            </div>

            {admin && (
              // 고정 항목 토글(삭제·이름 변경 불가 항목). "정산"은 항상 고정.
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: editor.settle ? 'default' : 'pointer' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--k-tx-191722)' }}>고정 항목</span>
                  <span style={{ fontSize: 11, color: 'var(--k-tx-a29ead)' }}>회원이 삭제하거나 이름을 바꿀 수 없어요</span>
                </span>
                <button
                  type="button" role="switch" aria-checked={!!editor.locked} aria-label="고정 항목" disabled={editor.settle}
                  className={`ios-toggle${editor.locked ? ' on' : ''}`} onClick={() => setEditor({ ...editor, locked: !editor.locked })}
                  style={editor.settle ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                ><span className="ios-toggle-knob" /></button>
              </label>
            )}

            <button className="btn-ink-pill" style={{ marginTop: 4 }} onClick={save}>저장</button>
          </div>
        </div>
      )}
    </div>
  );
}
