import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function SourceManage() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [addingCat, setAddingCat] = useState(false);
  const [addCatName, setAddCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatDraft, setEditCatDraft] = useState('');
  const [addingItemCatId, setAddingItemCatId] = useState(null);
  const [addItemDraft, setAddItemDraft] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemDraft, setEditItemDraft] = useState('');

  const load = useCallback(() => db.listSources().then(({ tree }) => setSources(tree)).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  const openAddCat = () => { setAddingCat(true); setAddCatName(''); };
  const cancelAddCat = () => setAddingCat(false);
  const saveAddCat = async () => {
    const name = addCatName.trim();
    if (!name) { setAddingCat(false); return; }
    await wrap(db.addSource(user.id, name, null));
    setAddingCat(false); load();
  };

  const startEditCat = (s) => { setEditingCatId(s.id); setEditCatDraft(s.name); };
  const cancelEditCat = () => setEditingCatId(null);
  const saveEditCat = async (s) => {
    const name = editCatDraft.trim();
    if (!name) { setEditingCatId(null); return; }
    await wrap(db.updateSource(s.id, name));
    setEditingCatId(null); load();
  };
  const delCat = async (s) => {
    if (!confirm(`'${s.name}'${s.children?.length ? ' 및 하위 항목' : ''}을(를) 삭제할까요?`)) return;
    await wrap(db.deleteSource(s.id)); load();
  };

  const openAddItem = (catId) => { setAddingItemCatId(catId); setAddItemDraft(''); };
  const cancelAddItem = () => setAddingItemCatId(null);
  const saveAddItem = async (catId) => {
    const name = addItemDraft.trim();
    if (!name) { setAddingItemCatId(null); return; }
    await wrap(db.addSource(user.id, name, catId));
    setAddingItemCatId(null); load();
  };

  const startEditItem = (it) => { setEditingItemId(it.id); setEditItemDraft(it.name); };
  const cancelEditItem = () => setEditingItemId(null);
  const saveEditItem = async (it) => {
    const name = editItemDraft.trim();
    if (!name) { setEditingItemId(null); return; }
    await wrap(db.updateSource(it.id, name));
    setEditingItemId(null); load();
  };
  const delItem = async (it) => {
    if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return;
    await wrap(db.deleteSource(it.id)); load();
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="원천 관리" flat right={
        <button className="tb-icon-btn" onClick={openAddCat} aria-label="대분류 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {addingCat && (
        <div className="tx-daycard inline-edit-row" style={{ marginTop: 14 }}>
          <input
            type="text" placeholder="대분류 이름" value={addCatName} onChange={(e) => setAddCatName(e.target.value)}
            autoFocus onKeyDown={(e) => e.key === 'Enter' && saveAddCat()} className="inline-edit-input"
          />
          <button className="inline-cancel-btn" onClick={cancelAddCat}>취소</button>
          <button className="inline-save-btn" onClick={saveAddCat}>저장</button>
        </div>
      )}

      {sources.map((top) => (
        <div className="tx-daycard" style={{ marginTop: 14 }} key={top.id}>
          {editingCatId === top.id ? (
            <div className="inline-edit-row">
              <input
                type="text" value={editCatDraft} onChange={(e) => setEditCatDraft(e.target.value)}
                autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEditCat(top)} className="inline-edit-input"
              />
              <button className="inline-cancel-btn" onClick={cancelEditCat}>취소</button>
              <button className="inline-save-btn" onClick={() => saveEditCat(top)}>저장</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 14px 18px' }}>
              <span style={{ flex: 1, fontSize: 13.75, fontWeight: 700, color: '#191722' }}>{top.name}</span>
              <button aria-label="세부 항목 추가" onClick={() => openAddItem(top.id)} className="row-icon-btn">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <button aria-label="대분류 수정" onClick={() => startEditCat(top)} className="row-icon-btn">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
              <button aria-label="대분류 삭제" onClick={() => delCat(top)} className="row-icon-btn danger">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
              </button>
            </div>
          )}

          {top.children?.map((it) => (
            editingItemId === it.id ? (
              <div key={it.id} className="inline-edit-row" style={{ paddingLeft: 30, borderTop: '1.5px solid #f2f1f5' }}>
                <input
                  type="text" value={editItemDraft} onChange={(e) => setEditItemDraft(e.target.value)}
                  autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEditItem(it)} className="inline-edit-input"
                />
                <button className="inline-cancel-btn" onClick={cancelEditItem}>취소</button>
                <button className="inline-save-btn" onClick={() => saveEditItem(it)}>저장</button>
              </div>
            ) : (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 8px 11px 34px', borderTop: '1.5px solid #f2f1f5' }}>
                <span style={{ flex: 1, fontSize: 13.25, fontWeight: 500, color: '#4a4652' }}>{it.name}</span>
                <button aria-label="세부 항목 수정" onClick={() => startEditItem(it)} className="row-icon-btn sm">
                  <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button aria-label="세부 항목 삭제" onClick={() => delItem(it)} className="row-icon-btn sm danger">
                  <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </div>
            )
          ))}

          {addingItemCatId === top.id && (
            <div className="inline-edit-row" style={{ paddingLeft: 30, borderTop: '1.5px solid #f2f1f5' }}>
              <input
                type="text" placeholder="세부 항목 이름" value={addItemDraft} onChange={(e) => setAddItemDraft(e.target.value)}
                autoFocus onKeyDown={(e) => e.key === 'Enter' && saveAddItem(top.id)} className="inline-edit-input"
              />
              <button className="inline-cancel-btn" onClick={cancelAddItem}>취소</button>
              <button className="inline-save-btn" onClick={() => saveAddItem(top.id)}>저장</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
