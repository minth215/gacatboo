import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { useDragReorder } from '../lib/useDragReorder.js';
import PageHeader from '../components/PageHeader.jsx';
import { tileBg } from '../components/TransactionList.jsx';

// 통계 페이지 원형 그래프 팔레트(Stats.jsx 의 PALETTE)를 흰색 85% 비율로 섞어 훨씬 연하게 만든 색.
const PALETTE = ['#FFE9EF', '#FDF1E2', '#E6F0F9', '#EEECFC', '#DFFAF5', '#FFFBFB', '#FFF4F1', '#F0F8F6', '#F6F2FC', '#ECF4F9', '#FFF7E4', '#E9F8EB', '#FBEEF6'];

// 정산 로직이 이름으로 찾는 분류 — 기본값 관리에서는 이름 변경·삭제 불가
const LOCKED_DEFAULT = (c) => c.type === 'income' && c.name === '정산';

// admin=true: 관리자 > 기타 관리 > 분류 기본값 관리(새 가입자에게 만들어 줄 분류). 수입/지출 탭으로 전환.
export default function CategoryManage({ admin = false }) {
  const params = useParams(); // income | expense
  const [adminType, setAdminType] = useState('expense');
  const type = admin ? adminType : params.type;
  const { user } = useAuth();
  const api = admin ? {
    list: (t) => db.listDefaultCategories(t),
    add: (t, name, emoji, color) => db.addDefaultCategory(t, name, emoji, color),
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

  const kind = type === 'income' ? '수입' : '지출';
  const valid = type === 'income' || type === 'expense';

  const load = useCallback(() => {
    if (!valid) return;
    api.list(type).then(setCategories).catch((e) => alert(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, valid, admin]);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => setEditor({ name: '', emoji: '💰', color: PALETTE[0] });
  const openEdit = (c) => setEditor({ id: c.id, locked: admin && LOCKED_DEFAULT(c), name: c.name, emoji: c.emoji || '', color: c.color || tileBg(c.name) });
  const closeModal = () => setEditor(null);

  const save = async () => {
    const name = editor.name.trim();
    if (!name) return closeModal();
    try {
      if (editor.id) await api.update(editor.id, { name: editor.locked ? undefined : name, emoji: editor.emoji, color: editor.color });
      else await api.add(type, name, editor.emoji, editor.color);
      closeModal(); load();
    } catch (e) { alert(e.message); }
  };
  const del = async (c) => {
    if (!confirm(`'${c.name}' 분류를 삭제할까요?`)) return;
    try { await api.remove(c.id); load(); } catch (e) { alert(e.message); }
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

      <div className="tx-daycard" style={{ marginTop: 14 }}>
        {categories.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>분류가 없습니다.</div>
        ) : categories.map((c, i) => (
          <div
            key={c.id} ref={setRowRef(c.id)}
            className={dragId === c.id ? 'drag-lift' : ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 16px', background: 'var(--k-bg-fff)',
              borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)',
            }}
          >
            <button onClick={() => openEdit(c)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: c.color || tileBg(c.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16.5, flex: 'none' }}>{c.emoji}</span>
              <span style={{ fontSize: 13.75, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{c.name}</span>
            </button>
            {admin && LOCKED_DEFAULT(c) ? <span style={{ width: 30, flex: 'none' }} /> : (
            <button aria-label="삭제" onClick={() => del(c)} className="cat-del-btn">
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
            </button>
            )}
            <span className="cat-drag-handle" aria-label="순서 변경" onPointerDown={startDrag(c.id)} style={{ touchAction: 'none', cursor: dragId === c.id ? 'grabbing' : 'grab' }}>
              <svg width="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
            </span>
          </div>
        ))}
      </div>

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
                type="text" placeholder="분류 이름" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} disabled={editor.locked}
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

            <button className="btn-ink-pill" style={{ marginTop: 4 }} onClick={save}>저장</button>
          </div>
        </div>
      )}
    </div>
  );
}
