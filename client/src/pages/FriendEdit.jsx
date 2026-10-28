import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { fieldStyle, labelStyle, optional, FriendGroupSelect } from './FriendAdd.jsx';

// 설정 > 친구 관리 > 친구 정보 수정(친구 카드를 누르면 이동).
// 이름 칸 옆: 회원 친구면 @아이디, 비회원이면 "회원 연결" 배지 → 회원 검색 모달(친구 추가의 회원 검색과 동일).
// 이름/메모/친구 그룹/회원 연결은 "저장"을 눌러야 반영된다.
export default function FriendEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [friends, setFriends] = useState(null);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState(null); // { nickname, memo, groupId, link: {id, username} | null }
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    db.listFriends().then(setFriends).catch((e) => { alert(e.message); setFriends([]); });
    db.listFriendGroups().then(setGroups).catch(() => setGroups([]));
  }, []);
  const friend = friends?.find((f) => f.id === Number(id));
  useEffect(() => {
    if (!friend || form) return;
    setForm({
      nickname: friend.nickname || '', memo: friend.memo || '', groupId: friend.group_id ? String(friend.group_id) : '',
      link: friend.friend_user_id ? { id: friend.friend_user_id, username: friend.friend?.username || '' } : null,
    });
  }, [friend, form]);

  if (!friends || (friend && !form)) return <Spinner />;
  if (!friend) return <div className="empty empty-center">친구를 찾을 수 없습니다.</div>;

  const linkedBefore = !!friend.friend_user_id;
  const save = async () => {
    const nickname = form.nickname.trim();
    if (!nickname) return alert('이름을 입력하세요.');
    if (busy) return;
    setBusy(true);
    try {
      await db.updateFriend(friend.id, {
        nickname, groupId: form.groupId ? Number(form.groupId) : null,
        ...(form.memo.trim() !== (friend.memo || '') ? { memo: form.memo } : {}),
        ...(!linkedBefore && form.link ? { friendUserId: form.link.id } : {}),
      });
      nav(-1);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title="친구 정보 수정" flat />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
          {/* 이름 + (회원) @아이디 / (비회원) "회원 연결" 배지 */}
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 0 16px' }}>
            <input
              type="text" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="친구 목록에 표시될 이름"
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', outline: 'none', padding: '14px 0' }}
            />
            {form.link ? (
              <span style={{ flex: 'none', fontSize: 12, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>@{form.link.username}</span>
            ) : (
              <button
                type="button" onClick={(e) => { e.preventDefault(); setSearchOpen(true); }}
                style={{ flex: 'none', border: 'none', borderRadius: 999, background: 'var(--k-bg-efeef2)', color: 'var(--k-tx-6c6779)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}
              >회원 연결</button>
            )}
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>메모{optional}</span>
          <textarea
            placeholder="친구에 대한 메모를 남겨 보세요" rows={3} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })}
            style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>친구 그룹{optional}</span>
          <FriendGroupSelect groups={groups} setGroups={setGroups} value={form.groupId} onChange={(v) => setForm((f) => ({ ...f, groupId: v }))} userId={user.id} />
        </label>
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.nickname.trim()} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      {searchOpen && (
        <MemberSearchModal
          userId={user.id} friends={friends} selfFriendId={friend.id}
          onClose={() => setSearchOpen(false)}
          onPick={(p) => { setForm((f) => ({ ...f, link: { id: p.id, username: p.username } })); setSearchOpen(false); }}
        />
      )}
    </div>
  );
}

// "회원 검색" 모달: 친구 추가의 회원 검색과 같은 처리(엔터/검색 버튼으로 검색, 아이디 정확히 일치·승인·검색 허용 회원만)
function MemberSearchModal({ userId, friends, selfFriendId, onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(undefined); // undefined(검색 전) | null(없음) | profile
  const [searching, setSearching] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    try { setFound(await db.findProfileByUsername(q)); }
    catch { setFound(null); }
    finally { setSearching(false); }
  };
  const isSelf = found && found.id === userId;
  const already = found && friends.some((f) => f.id !== selfFriendId && f.friend_user_id === found.id);

  return (
    <div className="catmodal-overlay" onClick={onClose}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>회원 검색</div>
          <button aria-label="닫기" onClick={onClose} className="catmodal-icon-btn">
            <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
        </div>
        <form onSubmit={search} style={{ position: 'relative' }}>
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
          <div style={{ padding: '18px 0 6px', textAlign: 'center', fontSize: 12.75, color: 'var(--k-tx-a29ead)' }}>일치하는 회원이 존재하지 않습니다.</div>
        ) : found ? (
          <>
            <div style={{ background: 'var(--k-bg-faf9f8)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{found.display_name || found.username}</div>
              <div style={{ marginTop: 3, fontSize: 12, color: 'var(--k-tx-a29ead)' }}>@{found.username}</div>
              {(isSelf || already) && (
                <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{isSelf ? '본인 아이디입니다.' : '이미 등록된 친구입니다.'}</div>
              )}
            </div>
            {!isSelf && !already && (
              <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} onClick={() => onPick(found)}>이 회원과 연결</button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
