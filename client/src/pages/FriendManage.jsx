import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DayCardRow } from '../components/TransactionList.jsx';

export default function FriendManage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 친구 카드만 스와이프로 열려 있도록
  const [editGroupDraft, setEditGroupDraft] = useState('');

  const load = useCallback(() => {
    db.listFriends().then(setFriends).catch((e) => alert(e.message));
    db.listFriendGroups().then(setGroups).catch((e) => alert(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  // 친구 추가는 별도 페이지(회원/비회원 탭). 친구 그룹 줄의 "+"는 그 그룹을 미리 선택해서 연다.
  const openAdd = () => nav('/settings/friends/add');
  const openAddToGroup = (groupId) => nav(groupId ? `/settings/friends/add?group=${groupId}` : '/settings/friends/add');
  // 친구 카드를 누르면 친구 정보 수정 페이지로
  const openEdit = (f) => nav(`/settings/friends/${f.id}/edit`);

  const remove = async (f) => {
    if (!confirm(`'${f.nickname}'을(를) 친구 목록에서 삭제할까요?`)) return;
    try { await db.deleteFriend(f.id); load(); } catch (e) { alert(e.message); }
  };

  const startEditGroup = (g) => { setEditingGroupId(g.id); setEditGroupDraft(g.name); };
  const cancelEditGroup = () => setEditingGroupId(null);
  const saveEditGroup = async (g) => {
    const name = editGroupDraft.trim();
    if (!name) { setEditingGroupId(null); return; }
    try { await db.updateFriendGroup(g.id, name); setEditingGroupId(null); load(); } catch (e) { alert(e.message); }
  };
  const deleteGroup = async (g) => {
    if (!confirm(`'${g.name}' 친구 그룹을 삭제할까요? (소속된 친구는 그룹 없음으로 남습니다)`)) return;
    try { await db.deleteFriendGroup(g.id); load(); } catch (e) { alert(e.message); }
  };

  const byName = (a, b) => a.nickname.localeCompare(b.nickname, 'ko');

  const sections = useMemo(() => {
    const byGroup = new Map(groups.map((g) => [g.id, []]));
    const ungrouped = [];
    for (const f of friends) {
      if (f.group_id && byGroup.has(f.group_id)) byGroup.get(f.group_id).push(f);
      else ungrouped.push(f);
    }
    const list = groups.map((g) => ({ group: g, items: [...byGroup.get(g.id)].sort(byName) }));
    if (ungrouped.length) list.push({ group: null, items: ungrouped.sort(byName) });
    return list;
  }, [friends, groups]);

  // 친구 카드: 누르면 편집 모달, 왼쪽으로 밀면 삭제 버튼(가계부 카드와 같은 스와이프)
  const friendRow = (f, i, count) => (
    <DayCardRow
      key={f.id} index={i} count={count} clickable
      isOpen={openId === f.id} onOpenChange={(open) => setOpenId(open ? f.id : null)}
      onTap={() => openEdit(f)} onDelete={() => remove(f)}
    >
      {/* 닉네임 바로 오른쪽에 (회원 친구) @아이디 */}
      <div style={{ flex: 1, minWidth: 0, padding: '1px 0 1px 2px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 13.25, fontWeight: 500, color: 'var(--k-tx-191722)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nickname}</span>
        {f.friend_user_id && f.friend?.username && <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>@{f.friend.username}</span>}
      </div>
    </DayCardRow>
  );

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="친구 관리" flat right={
        <button className="tb-icon-btn" onClick={openAdd} aria-label="친구 추가">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      } />

      {sections.length === 0 ? (
        <div className="empty empty-center">등록된 친구가 없습니다.</div>
      ) : sections.map(({ group, items }) => (
        <div style={{ marginTop: 20 }} key={group?.id ?? '_ungrouped'}>
          {group && editingGroupId === group.id ? (
            <div className="inline-edit-row">
              <input
                type="text" value={editGroupDraft} onChange={(e) => setEditGroupDraft(e.target.value)}
                autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEditGroup(group)} className="inline-edit-input"
              />
              <button className="inline-cancel-btn" onClick={cancelEditGroup}>취소</button>
              <button className="inline-save-btn" onClick={() => saveEditGroup(group)}>저장</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 18px', marginBottom: 8 }}>
              {group ? (
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{group.name}</span>
              ) : (
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--k-tx-a29ead)' }}>그룹 없음</span>
              )}
              <button aria-label="친구 추가" onClick={() => openAddToGroup(group?.id)} className="row-icon-btn sm">
                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              {group && (
                <>
                  <button aria-label="친구 그룹 수정" onClick={() => startEditGroup(group)} className="row-icon-btn sm">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button aria-label="친구 그룹 삭제" onClick={() => deleteGroup(group)} className="row-icon-btn sm danger">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                  </button>
                </>
              )}
            </div>
          )}
          {items.length === 0 ? (
            <div className="tx-daycard">
              <div className="small muted" style={{ padding: '14px 18px' }}>등록된 친구가 없습니다.</div>
            </div>
          ) : (
            <div className="tx-daygroup">{items.map((f, i) => friendRow(f, i, items.length))}</div>
          )}
        </div>
      ))}

    </div>
  );
}
