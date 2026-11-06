import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DayCardRow } from '../components/TransactionList.jsx';
import { useDragReorder } from '../lib/useDragReorder.js';

const isCardGroup = (t) => t === 'credit' || t === 'check';

// admin=true: 관리자 > 기타 관리 > 원천 기본값 관리(새 가입자에게 만들어 줄 원천)
export default function SourceManage({ admin = false }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const api = admin ? {
    list: () => db.listDefaultSources(),
    add: (name, parentId, groupType) => db.addDefaultSource(name, parentId, groupType),
    update: (id, name, groupType) => db.updateDefaultSource(id, name, groupType),
    remove: (id) => db.deleteDefaultSource(id),
    reorder: (ids) => db.reorderDefaultSources(ids),
    setPrimary: (id, kind, value) => db.setDefaultPrimarySource(id, kind, value),
  } : {
    list: () => db.listSources(),
    add: (name, parentId, groupType) => db.addSource(user.id, name, parentId, groupType),
    update: (id, name, groupType) => db.updateSource(id, name, groupType),
    remove: (id) => db.deleteSource(id),
    reorder: (ids) => db.reorderSources(ids),
    setPrimary: (id, kind, value) => db.setPrimarySource(id, kind, value),
  };
  const [sources, setSources] = useState([]);
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록
  // 편집(순서 변경) 모드: 그룹의 + 버튼이 핸들로, 세부 항목 오른쪽 끝에도 핸들
  const [editMode, setEditMode] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api.list().then(({ tree }) => setSources(tree)).catch((e) => alert(e.message)), [admin]);
  useEffect(() => { load(); }, [load]);

  const wrap = (p) => p.catch((e) => alert(e.message));

  // 추가/수정은 별도 페이지(SourceEdit)
  const base = admin ? '/admin/defaults/sources' : '/settings/sources';
  const openAddCat = () => nav(`${base}/new`);
  const openAddItem = (top) => nav(`${base}/${top.id}/new`);
  const openEditor = (src) => nav(`${base}/${src.id}/edit`);
  const delCat = async (s) => {
    if (!confirm(`'${s.name}'${s.children?.length ? ' 및 하위 항목' : ''}을(를) 삭제할까요?`)) return;
    await wrap(api.remove(s.id)); setOpenId(null); load();
  };
  const delItem = async (it) => {
    if (!confirm(`'${it.name}'을(를) 삭제할까요?`)) return;
    await wrap(api.remove(it.id)); setOpenId(null); load();
  };
  // 그룹 순서(그룹 전체가 함께 이동)
  const groupDrag = useDragReorder(sources, setSources, async (ids) => {
    try { await api.reorder(ids); } catch (e) { alert(e.message); load(); }
  });
  // 한 그룹의 세부 항목 순서 갱신(로컬)
  const setChildren = (topId) => (next) => setSources((prev) => prev.map((t) => (t.id === topId
    ? { ...t, children: typeof next === 'function' ? next(t.children || []) : next } : t)));
  const nameOf = (sid) => { for (const t of sources) { if (t.id === sid) return t.name; const c = (t.children || []).find((x) => x.id === sid); if (c) return c.name; } return ''; };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={admin ? '원천 기본값 관리' : '원천 관리'} flat right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 편집(순서 변경) — 켜져 있으면 먹색 */}
          <button
            className="tb-icon-btn" onClick={() => { setEditMode((v) => !v); setOpenId(null); }} aria-label={editMode ? '편집 완료' : '편집'} aria-pressed={editMode}
            style={editMode ? { background: 'var(--k-bg-191722)', color: 'var(--k-onink-fff)' } : undefined}
          >
            <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          <button className="tb-icon-btn" onClick={openAddCat} aria-label="원천 그룹 추가">
            <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      } />

      {sources.map((top, gi) => {
        // 그룹 카드 + 세부 항목 카드(+ 세부 항목 추가 줄)를 가계부 같은 날짜 카드처럼 이어 붙임.
        // 각 카드는 누르면 수정 모달, 왼쪽으로 밀면 삭제 버튼.
        const children = top.children || [];
        const count = 1 + children.length;
        return (
          <div className={`tx-daygroup${groupDrag.dragId === top.id ? ' drag-lift' : ''}`} style={{ marginTop: gi === 0 ? 0 : 14 }} key={top.id} ref={groupDrag.setRowRef(top.id)}>
            <DayCardRow
              index={0} count={count} clickable
              isOpen={openId === top.id} onOpenChange={(open) => setOpenId(open ? top.id : null)}
              onTap={() => openEditor(top)} onDelete={() => delCat(top)}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.75, fontWeight: 700, color: 'var(--k-tx-191722)', padding: '2px 0 2px 2px' }}>
                {/* 그룹명 + 그룹 특성(일반 제외, 회색 가는 작은 글씨) — 글자 아래쪽(기준선) 맞춤 */}
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {top.name}
                  {(isCardGroup(top.group_type) || top.group_type === 'onnuri') && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>{{ credit: '신용카드', check: '체크카드', onnuri: '디지털 온누리' }[top.group_type]}</span>
                  )}
                </span>
                <PrimaryBadges src={top} />
              </span>
              {editMode ? (
                // 그룹 핸들: 그룹 전체 순서 이동
                <DragHandle label="원천 그룹 순서 변경" active={groupDrag.dragId === top.id} onStart={groupDrag.startDrag(top.id)} />
              ) : (
                <button aria-label="원천 추가" onClick={(e) => { e.stopPropagation(); openAddItem(top); }} className="row-icon-btn">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              )}
            </DayCardRow>

            <ChildRows
              top={top} items={children} setItems={setChildren(top.id)} count={count} editMode={editMode} admin={admin}
              openId={openId} setOpenId={setOpenId} openEditor={openEditor} delItem={delItem} nameOf={nameOf}
              onReorder={async (ids) => { try { await api.reorder(ids); } catch (e) { alert(e.message); load(); } }}
            />

          </div>
        );
      })}

    </div>
  );
}

// 한 원천 그룹의 세부 항목 카드(편집 모드에서 핸들로 그룹 안 순서 변경)
function ChildRows({ top, items, setItems, count, editMode, admin, openId, setOpenId, openEditor, delItem, nameOf, onReorder }) {
  const { dragId, setRowRef, startDrag } = useDragReorder(items, setItems, onReorder);
  return (
    <>
      {items.map((it, i) => (
        <div key={it.id} ref={setRowRef(it.id)} className={dragId === it.id ? 'drag-lift' : ''}>
              <DayCardRow
                index={i + 1} count={count} clickable
                isOpen={openId === it.id} onOpenChange={(open) => setOpenId(open ? it.id : null)}
                onTap={() => openEditor(it)} onDelete={() => delItem(it)}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.25, fontWeight: 500, color: 'var(--k-tx-4a4652)', paddingLeft: 16 }}>
                  {it.name}
                  <PrimaryBadges src={it} />
                </span>
                {/* 상세: 카드 항목은 연결 계좌·납부일(회색 작은 글씨). 금액은 카드에 표시하지 않음 */}
                {/* 편집 모드에서는 숨김(핸들 자리) */}
                {!admin && !editMode && (isCardGroup(top.group_type) ? (
                  (it.linked_source_id || it.payment_day) ? (
                    <span style={{ flex: 'none', fontSize: 11, color: 'var(--k-tx-a29ead)', whiteSpace: 'nowrap' }}>
                      {[it.linked_source_id ? nameOf(it.linked_source_id) : '', it.payment_day ? `매달 ${it.payment_day}일` : ''].filter(Boolean).join(' · ')}
                    </span>
                  ) : null
                ) : null)}
                {/* 세부 항목 핸들: 이 항목만 이동 */}
                {editMode && <DragHandle inline label="원천 순서 변경" active={dragId === it.id} onStart={startDrag(it.id)} />}
              </DayCardRow>
        </div>
      ))}

    </>
  );
}

// 삼선 핸들(잡고 위아래로 끌어 순서 변경). 카드 탭·스와이프로 번지지 않게 이벤트를 막음
// inline: 세부 항목 행처럼 원래 버튼이 없던 자리 — 위아래 음수 여백으로 카드 높이를 바꾸지 않음
// (그룹 행은 + 버튼과 같은 28px 로 맞춤)
function DragHandle({ label, active, onStart, inline = false }) {
  return (
    <span
      className="cat-drag-handle" aria-label={label} role="button"
      onPointerDown={(e) => { e.stopPropagation(); onStart(e); }} onClick={(e) => e.stopPropagation()}
      style={{ touchAction: 'none', cursor: active ? 'grabbing' : 'grab', flex: 'none', ...(inline ? { height: 20, margin: '-4px 0' } : { width: 28, height: 28 }) }}
    >
      <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="5" y1="7" x2="19" y2="7" /><line x1="5" y1="12" x2="19" y2="12" /><line x1="5" y1="17" x2="19" y2="17" /></svg>
    </span>
  );
}

// 배지: 주결제(코랄핑크), 주입금(민트), 디지털 온누리 연결 카드(주황 "온누리"), 집계 제외(회색)
const PrimaryBadges = ({ src }) => (
  <>
    {src.is_primary_payment && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: '#FDE8EE', borderRadius: 999, padding: '2px 6px' }}>주결제</span>}
    {src.is_primary_deposit && <span style={{ fontSize: 9, fontWeight: 700, color: '#1FB597', background: '#E5FBF6', borderRadius: 999, padding: '2px 6px' }}>주입금</span>}
    {src.onnuri_linked && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8A00', background: '#FFF1DC', borderRadius: 999, padding: '2px 6px' }}>온누리</span>}
    {/* "집계 포함" OFF 원천 */}
    {src.include_in_totals === false && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: '2px 6px' }}>집계 제외</span>}
  </>
);
