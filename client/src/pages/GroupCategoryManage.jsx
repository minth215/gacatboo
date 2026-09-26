import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { useDragReorder } from '../lib/useDragReorder.js';
import PageHeader from '../components/PageHeader.jsx';

// 정산/구독은 그룹 상세 페이지 탭 구성(정산 탭, 구독 결제·입금 관리)이 이 이름에 의존하므로 삭제 불가
const PROTECTED_NAMES = ['정산', '구독'];

export default function GroupCategoryManage() {
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const load = useCallback(() => db.listGroupCategories().then(setCats).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setAdding(true); setAddName(''); };
  const cancelAdd = () => setAdding(false);
  const saveAdd = async () => {
    const name = addName.trim();
    if (!name) { setAdding(false); return; }
    try { await db.addGroupCategory(user.id, name); setAdding(false); load(); } catch (e) { alert(e.message); }
  };

  const startEdit = (c) => { setEditId(c.id); setEditDraft(c.name); };
  const cancelEdit = () => setEditId(null);
  const saveEdit = async (c) => {
    const name = editDraft.trim();
    if (!name) { setEditId(null); return; }
    try { await db.updateGroupCategory(c.id, { name, oldName: c.name }); setEditId(null); load(); } catch (e) { alert(e.message); }
  };
  const del = async (c) => {
    if (PROTECTED_NAMES.includes(c.name)) return;
    if (!confirm(`'${c.name}' 카테고리를 삭제할까요?`)) return;
    try { await db.deleteGroupCategory(c.id); load(); } catch (e) { alert(e.message); }
  };

  const { dragId, setRowRef, startDrag } = useDragReorder(cats, setCats, async (ids) => {
    try { await db.reorderGroupCategories(ids); } catch (e) { alert(e.message); load(); }
  });

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="그룹 카테고리 관리" flat right={
        <button className="tb-icon-btn" onClick={openAdd} aria-label="추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      <div className="tx-daycard" style={{ marginTop: 14 }}>
        {adding && (
          <div className="inline-edit-row">
            <input
              type="text" placeholder="그룹 카테고리 이름" value={addName} onChange={(e) => setAddName(e.target.value)}
              autoFocus onKeyDown={(e) => e.key === 'Enter' && saveAdd()} className="inline-edit-input"
            />
            <button className="inline-cancel-btn" onClick={cancelAdd}>취소</button>
            <button className="inline-save-btn" onClick={saveAdd}>저장</button>
          </div>
        )}

        {cats.length === 0 && !adding ? (
          <div className="empty" style={{ padding: '20px 0' }}>카테고리가 없습니다.</div>
        ) : cats.map((c, i) => (
          editId === c.id ? (
            <div key={c.id} className="inline-edit-row" style={{ borderTop: (i === 0 && !adding) ? 'none' : '1.5px solid #f2f1f5' }}>
              <input
                type="text" value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit(c)} className="inline-edit-input"
              />
              <button className="inline-cancel-btn" onClick={cancelEdit}>취소</button>
              <button className="inline-save-btn" onClick={() => saveEdit(c)}>저장</button>
            </div>
          ) : (
            <div
              key={c.id} ref={setRowRef(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 18px', background: '#fff',
                borderTop: (i === 0 && !adding) ? 'none' : '1.5px solid #f2f1f5', opacity: dragId === c.id ? 0.35 : 1,
              }}
            >
              <span style={{ flex: 1, fontSize: 13.75, fontWeight: 600, color: '#191722' }}>{c.name}</span>
              <button aria-label="수정" onClick={() => startEdit(c)} className="row-icon-btn">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
              {!PROTECTED_NAMES.includes(c.name) && (
                <button aria-label="삭제" onClick={() => del(c)} className="row-icon-btn danger">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              )}
              <span className="cat-drag-handle" aria-label="순서 변경" onPointerDown={startDrag(c.id)} style={{ touchAction: 'none', cursor: dragId === c.id ? 'grabbing' : 'grab' }}>
                <svg width="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
