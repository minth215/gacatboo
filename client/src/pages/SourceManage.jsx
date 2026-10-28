import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DayCardRow } from '../components/TransactionList.jsx';

const isCardGroup = (t) => t === 'credit' || t === 'check';

export default function SourceManage() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  // 원천 그룹 추가 모달(이름 + 그룹 특성). 수정은 카드를 눌러 여는 수정 모달(editor)에서.
  const [addingCat, setAddingCat] = useState(false);
  const [addCatName, setAddCatName] = useState('');
  const [addCatType, setAddCatType] = useState('general');
  const [addingItemCatId, setAddingItemCatId] = useState(null);
  const [addItemDraft, setAddItemDraft] = useState('');
  // 원천 그룹·세부 항목 수정 모달: 이름(+그룹 특성) + 주결제/주입금수단 지정. "저장"을 눌러야 반영.
  // { src, isGroup, parentType, name, groupType, payment, deposit }
  const [editor, setEditor] = useState(null);
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록

  const load = useCallback(() => db.listSources().then(({ tree }) => setSources(tree)).catch((e) => alert(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  const openAddCat = () => { setAddingCat(true); setAddCatName(''); setAddCatType('general'); };
  const cancelAddCat = () => setAddingCat(false);
  const saveAddCat = async () => {
    const name = addCatName.trim();
    if (!name) return alert('원천 그룹 이름을 입력하세요.');
    await wrap(db.addSource(user.id, name, null, addCatType));
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

  const openEditor = (src, parentType) => setEditor({
    src, isGroup: parentType === undefined, parentType: parentType || null,
    name: src.name, groupType: src.group_type || 'general',
    payment: !!src.is_primary_payment, deposit: !!src.is_primary_deposit,
  });
  // 신용카드/체크카드 그룹(과 그 세부 항목)은 주입금수단으로 지정할 수 없음
  const depositDisabled = editor ? isCardGroup(editor.isGroup ? editor.groupType : editor.parentType) : false;
  const saveEditor = async () => {
    const name = editor.name.trim();
    if (!name) return alert('이름을 입력하세요.');
    const { src } = editor;
    const deposit = depositDisabled ? false : editor.deposit;
    try {
      if (name !== src.name || (editor.isGroup && editor.groupType !== (src.group_type || 'general'))) {
        await db.updateSource(src.id, name, editor.isGroup ? editor.groupType : undefined);
      }
      if (editor.payment !== !!src.is_primary_payment) await db.setPrimarySource(src.id, 'payment', editor.payment);
      if (deposit !== !!src.is_primary_deposit) await db.setPrimarySource(src.id, 'deposit', deposit);
      setEditor(null); load();
    } catch (e) { alert(e.message); }
  };
  const delItem = async (it) => {
    if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return;
    await wrap(db.deleteSource(it.id)); load();
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
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>원천 그룹 추가</div>
              <button aria-label="닫기" onClick={cancelAddCat} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" placeholder="원천 그룹 이름" value={addCatName} onChange={(e) => setAddCatName(e.target.value)}
                autoFocus onKeyDown={(e) => e.key === 'Enter' && saveAddCat()}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-fff)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 12, padding: '12px 14px', outline: 'none' }}
              />
              {/* 그룹 특성(라벨 없음): 일반 / 신용카드 / 체크카드 */}
              <select
                value={addCatType} onChange={(e) => setAddCatType(e.target.value)} aria-label="원천 그룹 특성"
                style={{ flex: 'none', width: 104, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-fff)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 12, padding: '12px 10px', outline: 'none' }}
              >
                <option value="general">일반</option>
                <option value="credit">신용카드</option>
                <option value="check">체크카드</option>
              </select>
            </div>
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} onClick={saveAddCat}>추가</button>
          </div>
        </div>
      )}

      {sources.map((top) => {
        // 그룹 카드 + 세부 항목 카드(+ 세부 항목 추가 줄)를 가계부 같은 날짜 카드처럼 이어 붙임.
        // 각 카드는 누르면 수정 모달, 왼쪽으로 밀면 삭제 버튼.
        const children = top.children || [];
        const count = 1 + children.length + (addingItemCatId === top.id ? 1 : 0);
        return (
          <div className="tx-daygroup" style={{ marginTop: 14 }} key={top.id}>
            <DayCardRow
              index={0} count={count} clickable
              isOpen={openId === top.id} onOpenChange={(open) => setOpenId(open ? top.id : null)}
              onTap={() => openEditor(top)} onDelete={() => delCat(top)}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)', padding: '2px 0 2px 2px' }}>
                {/* 그룹명 + 그룹 특성(일반 제외, 회색 가는 작은 글씨) — 글자 아래쪽(기준선) 맞춤 */}
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {top.name}
                  {isCardGroup(top.group_type) && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>{top.group_type === 'credit' ? '신용카드' : '체크카드'}</span>
                  )}
                </span>
                <PrimaryBadges src={top} />
              </span>
              <button aria-label="세부 항목 추가" onClick={(e) => { e.stopPropagation(); openAddItem(top.id); }} className="row-icon-btn">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </DayCardRow>

            {children.map((it, i) => (
              <DayCardRow
                key={it.id} index={i + 1} count={count} clickable
                isOpen={openId === it.id} onOpenChange={(open) => setOpenId(open ? it.id : null)}
                onTap={() => openEditor(it, top.group_type || 'general')} onDelete={() => delItem(it)}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.25, fontWeight: 500, color: 'var(--k-tx-4a4652)', paddingLeft: 16 }}>
                  {it.name}
                  <PrimaryBadges src={it} />
                </span>
              </DayCardRow>
            ))}

            {addingItemCatId === top.id && (
              <DayCardRow index={count - 1} count={count}>
                <div className="inline-edit-row" style={{ flex: 1, minWidth: 0, padding: '0 0 0 16px' }}>
                  <input
                    type="text" placeholder="세부 항목 이름" value={addItemDraft} onChange={(e) => setAddItemDraft(e.target.value)}
                    autoFocus onKeyDown={(e) => e.key === 'Enter' && saveAddItem(top.id)} className="inline-edit-input"
                  />
                  <button className="inline-cancel-btn" onClick={cancelAddItem}>취소</button>
                  <button className="inline-save-btn" onClick={() => saveAddItem(top.id)}>저장</button>
                </div>
              </DayCardRow>
            )}
          </div>
        );
      })}

      {editor && (
        <div className="catmodal-overlay" onClick={() => setEditor(null)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{editor.isGroup ? '원천 그룹 수정' : '세부 항목 수정'}</div>
              <button aria-label="닫기" onClick={() => setEditor(null)} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" placeholder={editor.isGroup ? '원천 그룹 이름' : '세부 항목 이름'} value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveEditor()}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-fff)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 12, padding: '12px 14px', outline: 'none' }}
              />
              {editor.isGroup && (
                // 그룹 특성(라벨 없음): 일반 / 신용카드 / 체크카드
                <select
                  value={editor.groupType} onChange={(e) => setEditor({ ...editor, groupType: e.target.value })} aria-label="원천 그룹 특성"
                  style={{ flex: 'none', width: 104, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-fff)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 12, padding: '12px 10px', outline: 'none' }}
                >
                  <option value="general">일반</option>
                  <option value="credit">신용카드</option>
                  <option value="check">체크카드</option>
                </select>
              )}
            </div>
            {/* 주결제/주입금수단 지정: 누르면 선택 상태만 바뀌고 "저장" 때 반영 */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[['payment', '주결제수단', '#2CDDB9', '#E5FBF6'], ['deposit', '주입금수단', '#FF8A00', '#FFF1DC']].map(([key, label, fg, bg]) => {
                const disabled = key === 'deposit' && depositDisabled;
                const on = !disabled && editor[key];
                return (
                  <button
                    key={key} type="button" disabled={disabled} aria-pressed={on}
                    onClick={() => setEditor({ ...editor, [key]: !editor[key] })}
                    style={{
                      flex: 1, height: 40, borderRadius: 999, fontFamily: 'inherit', fontSize: 12.75, fontWeight: 700,
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                      border: `1.5px solid ${on ? fg : 'var(--k-bd-efeef2)'}`, background: on ? bg : 'var(--k-bg-fff)', color: on ? fg : 'var(--k-tx-8b8798)',
                    }}
                  >{on ? `✓ ${label}` : label}</button>
                );
              })}
            </div>
            {depositDisabled && (
              <div style={{ marginTop: -4, fontSize: 11, color: 'var(--k-tx-a29ead)' }}>신용카드/체크카드 그룹은 주입금수단으로 지정할 수 없어요.</div>
            )}
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} onClick={saveEditor}>저장</button>
          </div>
        </div>
      )}
    </div>
  );
}

const PrimaryBadges = ({ src }) => (
  <>
    {src.is_primary_payment && <span style={{ fontSize: 9, fontWeight: 700, color: '#2CDDB9', background: '#E5FBF6', borderRadius: 999, padding: '2px 6px' }}>주결제</span>}
    {src.is_primary_deposit && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>주입금</span>}
  </>
);
