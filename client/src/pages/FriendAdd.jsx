import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

// 설정 > 친구 관리 > 친구 추가. 상단 탭으로 회원/비회원 구분(기본 회원).
//  · 회원: 가캣부 아이디 검색(검색 버튼/엔터를 눌렀을 때, 정확히 일치하는 승인된 회원만) → 회원 카드 아래에서
//    메모/친구 그룹 입력 후 추가
//  · 비회원: 이름(필수)/메모/친구 그룹 입력 후 추가
// ?group=<id> 로 들어오면(친구 그룹 줄의 "+") 그 친구 그룹이 미리 선택된다.
const NEW_GROUP = '__new_group__';

const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)',
  border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' };
const optional = <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span>;

// 친구 그룹 선택(+ 새 친구 그룹 바로 추가)
function FriendGroupSelect({ groups, setGroups, value, onChange, userId }) {
  const [newName, setNewName] = useState(null); // null(숨김) | 입력 중인 문자열
  const saveNew = async () => {
    const name = (newName || '').trim();
    if (!name) { setNewName(null); return; }
    try {
      const g = await db.addFriendGroup(userId, name);
      setGroups((prev) => [...prev, g]);
      onChange(String(g.id));
      setNewName(null);
    } catch (e) { alert(e.message); }
  };
  return (
    <>
      <select
        value={value} onChange={(e) => (e.target.value === NEW_GROUP ? setNewName('') : onChange(e.target.value))}
        style={{ ...fieldStyle, appearance: 'none' }}
      >
        <option value="">그룹 없음</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        <option value={NEW_GROUP}>+ 새 친구 그룹 추가</option>
      </select>
      {newName !== null && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveNew())}
            placeholder="새 친구 그룹 이름(예: 직장, 가족)" autoFocus className="catmodal-name-input" style={{ flex: 1 }}
          />
          <button type="button" className="inline-cancel-btn" onClick={() => setNewName(null)}>취소</button>
          <button type="button" className="inline-save-btn" onClick={saveNew}>추가</button>
        </div>
      )}
    </>
  );
}

export default function FriendAdd() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('member'); // member | guest
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [busy, setBusy] = useState(false);

  // 회원 탭
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(undefined); // undefined(검색 전) | null(없음) | profile
  const [searching, setSearching] = useState(false);
  const [memberMemo, setMemberMemo] = useState('');
  const [memberGroupId, setMemberGroupId] = useState(params.get('group') || '');

  // 비회원 탭
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [guestGroupId, setGuestGroupId] = useState(params.get('group') || '');

  useEffect(() => {
    db.listFriendGroups().then(setGroups).catch(() => setGroups([]));
    db.listFriends().then(setFriends).catch(() => setFriends([]));
  }, []);

  // 아이디 검색: 키패드의 검색 버튼(엔터)이나 검색 아이콘을 눌렀을 때만 정확히 일치하는 회원을 찾는다(승인된 회원만)
  const search = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    try { setFound(await db.findProfileByUsername(q)); }
    catch { setFound(null); }
    finally { setSearching(false); }
  };

  const isSelf = found && found.id === user.id;
  const already = found && friends.some((f) => f.friend_user_id === found.id);

  const addMember = async () => {
    if (!found || isSelf || already || busy) return;
    setBusy(true);
    try {
      await db.addFriend(user.id, { friendUserId: found.id, nickname: found.display_name || found.username, memo: memberMemo, groupId: memberGroupId ? Number(memberGroupId) : null });
      nav(-1);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const addGuest = async () => {
    if (!name.trim()) return alert('이름을 입력하세요.');
    if (busy) return;
    setBusy(true);
    try {
      await db.addFriend(user.id, { nickname: name, memo, groupId: guestGroupId ? Number(guestGroupId) : null });
      nav(-1);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title="친구 추가" flat />

      <div style={{ marginTop: 14, display: 'flex', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: 4 }}>
        {[['member', '회원'], ['guest', '비회원']].map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            flex: 1, border: 'none', borderRadius: 999, padding: '11px 0', fontFamily: 'inherit',
            fontSize: 13.25, fontWeight: 700, cursor: 'pointer',
            background: tab === t ? 'var(--k-bg-fff)' : 'transparent', color: tab === t ? 'var(--k-tx-191722)' : 'var(--k-tx-8b8798)',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'member' ? (
        <>
          {/* 그룹 만들기 > 멤버 추가의 친구 닉네임 검색창과 같은 모양. 검색은 엔터/키패드 검색 버튼으로 */}
          <form onSubmit={search} style={{ position: 'relative', marginTop: 16 }}>
            <button type="submit" aria-label="검색" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </button>
            <input
              type="search" enterKeyHint="search" className="plain-search" placeholder="가캣부 아이디 검색" value={query} autoFocus
              onChange={(e) => { const v = e.target.value.replace(/\s/g, ''); setQuery(v); if (!v) setFound(undefined); }}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 999, padding: '12px 16px 12px 40px', outline: 'none', WebkitAppearance: 'none', appearance: 'none' }}
            />
          </form>

          {found === null ? (
            <div className="empty empty-center" style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {'일치하는 회원이 존재하지 않습니다.\n비회원 탭에서 추가해 주세요.'}
            </div>
          ) : found ? (
            <>
              <div style={{ marginTop: 16, background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', padding: '16px 16px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{found.display_name || found.username}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--k-tx-a29ead)' }}>@{found.username}</div>
                {(isSelf || already) && (
                  <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{isSelf ? '본인 아이디입니다.' : '이미 등록된 친구입니다.'}</div>
                )}
              </div>
              {!isSelf && !already && (
                // 메모/친구 그룹은 비회원 탭처럼 카드 바깥에
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={labelStyle}>메모{optional}</span>
                    <textarea
                      placeholder="친구에 대한 메모를 남겨 보세요" rows={3} value={memberMemo} onChange={(e) => setMemberMemo(e.target.value)}
                      style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={labelStyle}>친구 그룹{optional}</span>
                    <FriendGroupSelect groups={groups} setGroups={setGroups} value={memberGroupId} onChange={setMemberGroupId} userId={user.id} />
                  </label>
                  <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy} onClick={addMember}>
                    {busy ? '추가 중…' : '친구 추가'}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </>
      ) : (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
            <input type="text" placeholder="친구 목록에 표시될 이름" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} autoFocus />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>메모{optional}</span>
            <textarea
              placeholder="친구에 대한 메모를 남겨 보세요" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)}
              style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>친구 그룹{optional}</span>
            <FriendGroupSelect groups={groups} setGroups={setGroups} value={guestGroupId} onChange={setGuestGroupId} userId={user.id} />
          </label>
          <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !name.trim()} onClick={addGuest}>
            {busy ? '추가 중…' : '친구 추가'}
          </button>
        </div>
      )}
    </div>
  );
}
