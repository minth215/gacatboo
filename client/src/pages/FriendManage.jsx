import { useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

const NEW_GROUP = '__new_group__';

export default function FriendManage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [editor, setEditor] = useState(null); // null | {id?, username, foundProfile, nickname, groupId}
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState('');
  const [newGroupName, setNewGroupName] = useState(null); // null(숨김) | 입력 중인 문자열
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editGroupDraft, setEditGroupDraft] = useState('');

  const load = useCallback(() => {
    db.listFriends().then(setFriends).catch((e) => alert(e.message));
    db.listFriendGroups().then(setGroups).catch((e) => alert(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setErr(''); setLookupErr(''); setNewGroupName(null);
    setEditor({ username: '', foundProfile: null, nickname: '', groupId: '' });
  };
  const openEdit = (f) => {
    setErr(''); setLookupErr(''); setNewGroupName(null);
    setEditor({
      id: f.id,
      username: f.friend?.username || '',
      foundProfile: f.friend_user_id ? { id: f.friend_user_id, username: f.friend?.username, display_name: f.friend?.display_name } : null,
      nickname: f.nickname,
      groupId: f.group_id ? String(f.group_id) : '',
    });
  };
  const closeModal = () => setEditor(null);

  const search = async () => {
    if (!editor.username.trim()) return;
    setLookupBusy(true); setLookupErr('');
    try {
      const prof = await db.findProfileByUsername(editor.username);
      setEditor((prev) => ({ ...prev, foundProfile: prof, nickname: prof.display_name }));
    } catch (e) {
      setEditor((prev) => ({ ...prev, foundProfile: null }));
      setLookupErr(e.message);
    } finally {
      setLookupBusy(false);
    }
  };

  const onGroupSelect = (v) => {
    if (v === NEW_GROUP) { setNewGroupName(''); return; }
    setEditor({ ...editor, groupId: v });
  };
  const saveNewGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { setNewGroupName(null); return; }
    try {
      const g = await db.addFriendGroup(user.id, name);
      setGroups((prev) => [...prev, g]);
      setEditor((prev) => ({ ...prev, groupId: String(g.id) }));
      setNewGroupName(null);
    } catch (e) { setErr(e.message); }
  };

  const save = async () => {
    setErr('');
    const nickname = editor.nickname.trim();
    if (!nickname) return setErr('이름을 입력하세요.');
    setBusy(true);
    try {
      const groupId = editor.groupId ? Number(editor.groupId) : null;
      if (editor.id) {
        await db.updateFriend(editor.id, { nickname, groupId });
      } else {
        await db.addFriend(user.id, { friendUserId: editor.foundProfile?.id || null, nickname, groupId });
      }
      closeModal(); load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

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
    if (!confirm(`'${g.name}' 분류를 삭제할까요? (소속된 친구는 미분류로 남습니다)`)) return;
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

  const friendRow = (f, i) => (
    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 8px 13px 18px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{f.nickname}</div>
        {f.friend_user_id && <div style={{ marginTop: 2, fontSize: 10.5, color: '#a29ead' }}>@{f.friend?.username}</div>}
      </div>
      <button aria-label="친구 수정" onClick={() => openEdit(f)} className="row-icon-btn sm">
        <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
      <button aria-label="친구 삭제" onClick={() => remove(f)} className="row-icon-btn sm danger">
        <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
      </button>
    </div>
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
        <div className="tx-daycard" style={{ marginTop: 14 }} key={group?.id ?? '_ungrouped'}>
          {group ? (
            editingGroupId === group.id ? (
              <div className="inline-edit-row">
                <input
                  type="text" value={editGroupDraft} onChange={(e) => setEditGroupDraft(e.target.value)}
                  autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEditGroup(group)} className="inline-edit-input"
                />
                <button className="inline-cancel-btn" onClick={cancelEditGroup}>취소</button>
                <button className="inline-save-btn" onClick={() => saveEditGroup(group)}>저장</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 14px 18px' }}>
                <span style={{ flex: 1, fontSize: 13.75, fontWeight: 700, color: '#191722' }}>{group.name}</span>
                <button aria-label="분류 수정" onClick={() => startEditGroup(group)} className="row-icon-btn">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button aria-label="분류 삭제" onClick={() => deleteGroup(group)} className="row-icon-btn danger">
                  <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                </button>
              </div>
            )
          ) : (
            <div style={{ padding: '14px 8px 14px 18px' }}>
              <span style={{ fontSize: 13.75, fontWeight: 700, color: '#a29ead' }}>미분류</span>
            </div>
          )}
          {items.length === 0 ? (
            <div className="small muted" style={{ padding: '0 18px 14px' }}>등록된 친구가 없습니다.</div>
          ) : items.map((f, i) => friendRow(f, i))}
        </div>
      ))}

      {editor && (
        <div className="catmodal-overlay" onClick={closeModal}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>{editor.id ? '친구 수정' : '친구 추가'}</div>
              <button aria-label="닫기" onClick={closeModal} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            {editor.id ? (
              editor.foundProfile && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>가캣부 아이디</span>
                  <input value={`@${editor.username}`} disabled className="catmodal-name-input" />
                </label>
              )
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={editor.username} onChange={(e) => setEditor({ ...editor, username: e.target.value, foundProfile: null })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
                    placeholder="아이디로 검색" autoFocus className="catmodal-name-input" style={{ flex: 1 }}
                  />
                  <button type="button" className="row-icon-btn" style={{ width: 44 }} disabled={lookupBusy} onClick={search} aria-label="검색">
                    <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.2" y1="16.2" x2="21" y2="21" /></svg>
                  </button>
                </div>
                {lookupErr && <p className="small muted" style={{ margin: 0 }}>{lookupErr}</p>}
                {editor.foundProfile && <p className="small" style={{ margin: 0, color: 'var(--income)', fontWeight: 700 }}>{editor.foundProfile.display_name}님을 찾았습니다.</p>}
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
              <input value={editor.nickname} onChange={(e) => setEditor({ ...editor, nickname: e.target.value })} placeholder="친구 목록에 표시될 이름" className="catmodal-name-input" />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b8798' }}>분류</span>
              <select value={editor.groupId} onChange={(e) => onGroupSelect(e.target.value)} className="catmodal-name-input">
                <option value="">미분류</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value={NEW_GROUP}>+ 새 분류 추가</option>
              </select>
              {newGroupName !== null && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveNewGroup())}
                    placeholder="새 분류 이름(예: 직장, 가족)" autoFocus className="catmodal-name-input" style={{ flex: 1 }}
                  />
                  <button type="button" className="inline-cancel-btn" onClick={() => setNewGroupName(null)}>취소</button>
                  <button type="button" className="inline-save-btn" onClick={saveNewGroup}>추가</button>
                </div>
              )}
            </label>

            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
            <button className="btn-ink-pill" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
