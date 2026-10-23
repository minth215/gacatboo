import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function SourceManage() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  // 원천 그룹 추가/수정 모달(이름 + 그룹 특성). editingCat 이 있으면 수정, 없으면 추가.
  const [addingCat, setAddingCat] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [addCatName, setAddCatName] = useState('');
  const [addCatType, setAddCatType] = useState('general');
  const [addingItemCatId, setAddingItemCatId] = useState(null);
  const [addItemDraft, setAddItemDraft] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemDraft, setEditItemDraft] = useState('');
  const [primaryModal, setPrimaryModal] = useState(null); // 주결제수단/주입금수단 지정 모달 대상 원천

  const load = useCallback(() => db.listSources().then(({ tree }) => setSources(tree)).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  const openAddCat = () => { setEditingCat(null); setAddingCat(true); setAddCatName(''); setAddCatType('general'); };
  const startEditCat = (s) => { setEditingCat(s); setAddingCat(true); setAddCatName(s.name); setAddCatType(s.group_type || 'general'); };
  const cancelAddCat = () => { setAddingCat(false); setEditingCat(null); };
  const saveAddCat = async () => {
    const name = addCatName.trim();
    if (!name) return alert('원천 그룹 이름을 입력하세요.');
    if (editingCat) await wrap(db.updateSource(editingCat.id, name, addCatType));
    else await wrap(db.addSource(user.id, name, null, addCatType));
    cancelAddCat(); load();
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

  const togglePrimary = async (kind) => {
    const key = kind === 'payment' ? 'is_primary_payment' : 'is_primary_deposit';
    await wrap(db.setPrimarySource(primaryModal.id, kind, !primaryModal[key]));
    setPrimaryModal(null); load();
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="원천 관리" flat right={
        <button className="tb-icon-btn" onClick={openAddCat} aria-label="원천 그룹 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {addingCat && (
        <div className="catmodal-overlay" onClick={cancelAddCat}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>{editingCat ? '원천 그룹 수정' : '원천 그룹 추가'}</div>
              <button aria-label="닫기" onClick={cancelAddCat} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" placeholder="원천 그룹 이름" value={addCatName} onChange={(e) => setAddCatName(e.target.value)}
                autoFocus onKeyDown={(e) => e.key === 'Enter' && saveAddCat()}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#fff', border: '1.5px solid #efeef2', borderRadius: 12, padding: '12px 14px', outline: 'none' }}
              />
              {/* 그룹 특성(라벨 없음): 일반 / 신용카드 / 체크카드 */}
              <select
                value={addCatType} onChange={(e) => setAddCatType(e.target.value)} aria-label="원천 그룹 특성"
                style={{ flex: 'none', width: 104, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#fff', border: '1.5px solid #efeef2', borderRadius: 12, padding: '12px 10px', outline: 'none' }}
              >
                <option value="general">일반</option>
                <option value="credit">신용카드</option>
                <option value="check">체크카드</option>
              </select>
            </div>
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} onClick={saveAddCat}>{editingCat ? '수정' : '추가'}</button>
          </div>
        </div>
      )}

      {sources.map((top) => (
        <div className="tx-daycard" style={{ marginTop: 14 }} key={top.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 14px 18px', cursor: 'pointer' }} onClick={() => setPrimaryModal(top)}>
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.75, fontWeight: 700, color: '#191722' }}>
                {/* 그룹명 + 그룹 특성(일반 제외, 회색 가는 작은 글씨) — 글자 아래쪽(기준선) 맞춤 */}
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {top.name}
                  {(top.group_type === 'credit' || top.group_type === 'check') && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#a29ead' }}>{top.group_type === 'credit' ? '신용카드' : '체크카드'}</span>
                  )}
                </span>
                {top.is_primary_payment && <span style={{ fontSize: 9, fontWeight: 700, color: '#2CDDB9', background: '#E5FBF6', borderRadius: 999, padding: '2px 6px' }}>주결제</span>}
                {top.is_primary_deposit && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>주입금</span>}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()}>
                <button aria-label="세부 항목 추가" onClick={() => openAddItem(top.id)} className="row-icon-btn">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <button aria-label="원천 그룹 수정" onClick={() => startEditCat(top)} className="row-icon-btn">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button aria-label="원천 그룹 삭제" onClick={() => delCat(top)} className="row-icon-btn danger">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </div>
            </div>

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
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 8px 11px 34px', borderTop: '1.5px solid #f2f1f5', cursor: 'pointer' }} onClick={() => setPrimaryModal(it)}>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.25, fontWeight: 500, color: '#4a4652' }}>
                  {it.name}
                  {it.is_primary_payment && <span style={{ fontSize: 9, fontWeight: 700, color: '#2CDDB9', background: '#E5FBF6', borderRadius: 999, padding: '2px 6px' }}>주결제</span>}
                  {it.is_primary_deposit && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>주입금</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()}>
                  <button aria-label="세부 항목 수정" onClick={() => startEditItem(it)} className="row-icon-btn sm">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button aria-label="세부 항목 삭제" onClick={() => delItem(it)} className="row-icon-btn sm danger">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </div>
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

      {primaryModal && (
        <div className="catmodal-overlay" onClick={() => setPrimaryModal(null)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>{primaryModal.name}</div>
              <button aria-label="닫기" onClick={() => setPrimaryModal(null)} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button" className="btn-ink-pill" style={{ marginTop: 0, ...(primaryModal.is_primary_payment ? {} : { background: '#f4f2f0', color: '#191722' }) }}
                onClick={() => togglePrimary('payment')}
              >
                {primaryModal.is_primary_payment ? '주결제수단 해제' : '주결제수단으로 지정'}
              </button>
              <button
                type="button" className="btn-ink-pill" style={{ marginTop: 0, ...(primaryModal.is_primary_deposit ? {} : { background: '#f4f2f0', color: '#191722' }) }}
                onClick={() => togglePrimary('deposit')}
              >
                {primaryModal.is_primary_deposit ? '주입금수단 해제' : '주입금수단으로 지정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
