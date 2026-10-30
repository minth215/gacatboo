import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db.js';

// 그룹 멤버 고르기(그룹 만들기 3단계 / 그룹 상세 > 멤버 추가 페이지 공용).
// 친구 목록 / 회원 / 비회원 탭에서 고른 멤버가 한 목록(선택 알약)으로 합쳐지고, 회원은 초대 여부를 고를 수 있다.
// useMemberPicker 가 상태와 화면 조각(header: 고정 영역, body: 스크롤 영역, confirmModal, toastEl)을 돌려주고,
// 페이지는 그 조각을 자기 레이아웃에 배치한 뒤 addAll(groupId, startDate)로 실제 추가한다.

const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)',
  border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

// 초대장 토글 버튼: 켜짐 = 검은 원 + 흰 편지지, 꺼짐 = 회색 원 + 원 끝까지 닿는 빗금
export function InviteButton({ on, onClick }) {
  return (
    <button
      type="button" aria-label={on ? '초대함' : '초대 안 함'} aria-pressed={on} onClick={onClick}
      style={{ position: 'relative', overflow: 'hidden', width: 30, height: 30, borderRadius: '50%', border: 'none', background: on ? 'var(--k-bg-191722)' : 'var(--k-bg-f4f2f0)', color: on ? 'var(--k-onink-fff)' : 'var(--k-tx-b6b2c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', padding: 0 }}
    >
      <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" />
      </svg>
      {!on && (
        <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1="0" y1="30" x2="30" y2="0" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
    </button>
  );
}

// existingMembers: 이미 그룹에 있는 멤버(그룹 상세에서 추가할 때) — 친구 목록에서 "멤버" 표시, 회원 탭 중복 방지
export function useMemberPicker({ userId, existingMembers = [] }) {
  const [friends, setFriends] = useState([]);
  const [friendGroups, setFriendGroups] = useState([]);
  const [friendQuery, setFriendQuery] = useState('');
  const chipsRef = useRef(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [customMembers, setCustomMembers] = useState([]); // [{ nickname, username, memo, invite, blocked }] — 회원 탭(username 있음)/비회원 탭(외부 멤버)
  const [memberTab, setMemberTab] = useState('friends'); // friends | member | guest
  // 친구 목록의 회원 친구별 초대 여부(기본 초대). 끄면 초대장 없이 외부 멤버로 추가.
  const [noInviteFriendIds, setNoInviteFriendIds] = useState([]);
  // 그룹 초대를 허용하지 않은 회원 친구(초대 토글을 켤 수 없음)
  const [inviteBlockedIds, setInviteBlockedIds] = useState([]);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg); setToastKey((k) => k + 1);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  // 회원 탭: 아이디 검색(엔터/검색 버튼)
  const [memberQuery, setMemberQuery] = useState('');
  const [memberFound, setMemberFound] = useState(undefined); // undefined(검색 전) | null(없음) | profile
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberNickname, setMemberNickname] = useState('');
  // 비회원 탭
  const [guestName, setGuestName] = useState('');
  const [guestMemo, setGuestMemo] = useState('');

  useEffect(() => {
    db.listFriends().then((fs) => {
      setFriends(fs);
      const ids = [...new Set(fs.map((f) => f.friend_user_id).filter(Boolean))];
      db.listProfilesByIds(ids).then((ps) => {
        const blocked = new Set(ps.filter((p) => p.allow_group_invite === false).map((p) => p.id));
        setInviteBlockedIds(fs.filter((f) => blocked.has(f.friend_user_id)).map((f) => f.id));
      }).catch(() => {});
    }).catch(() => {});
    db.listFriendGroups().then(setFriendGroups).catch(() => {});
  }, []);

  const existingUserIds = existingMembers.map((m) => m.user_id).filter(Boolean);
  const existingUsernames = existingMembers.flatMap((m) => [m.username, m.external_username]).filter(Boolean);
  const isExistingFriend = (f) => (f.friend_user_id && existingUserIds.includes(f.friend_user_id))
    || (f.friend?.username && existingUsernames.includes(f.friend.username));

  const toggleFriend = (id) => setSelectedFriendIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const removeFriend = (id) => setSelectedFriendIds((ids) => ids.filter((x) => x !== id));
  const removeCustom = (idx) => setCustomMembers((ms) => ms.filter((_, i) => i !== idx));

  const toggleInvite = (f) => {
    if (inviteBlockedIds.includes(f.id)) { showToast(`${f.nickname} 님은 그룹 초대 비허용 상태입니다`); return; }
    setNoInviteFriendIds((ids) => (ids.includes(f.id) ? ids.filter((x) => x !== f.id) : [...ids, f.id]));
  };
  const friendInvites = (f) => !!f?.friend_user_id && !noInviteFriendIds.includes(f.id) && !inviteBlockedIds.includes(f.id);
  // 회원 탭으로 추가한 멤버의 초대 토글
  const toggleCustomInvite = (idx) => {
    const m = customMembers[idx];
    if (!m?.username) return;
    if (m.blocked) { showToast(`${m.nickname} 님은 그룹 초대 비허용 상태입니다`); return; }
    setCustomMembers((ms) => ms.map((x, i) => (i === idx ? { ...x, invite: !x.invite } : x)));
  };
  // 초대장을 받을 멤버(확인 모달·알약 색에 사용)
  const invitees = [
    ...selectedFriendIds.map((id) => friends.find((f) => f.id === id)).filter((f) => f?.friend_user_id && !inviteBlockedIds.includes(f.id))
      .map((f) => ({ key: `f${f.id}`, nickname: f.nickname, on: friendInvites(f), toggle: () => toggleInvite(f) })),
    ...customMembers.map((m, idx) => ({ m, idx })).filter(({ m }) => m.username && !m.blocked)
      .map(({ m, idx }) => ({ key: `c${idx}`, nickname: m.nickname, on: !!m.invite, toggle: () => toggleCustomInvite(idx) })),
  ];
  const hasInvites = invitees.some((x) => x.on);
  const selectedCount = selectedFriendIds.length + customMembers.length;

  const searchMember = async (e) => {
    e?.preventDefault();
    const q = memberQuery.trim();
    if (!q || memberSearching) return;
    setMemberSearching(true);
    try { const p = await db.findProfileByUsername(q); setMemberFound(p); setMemberNickname(p.display_name || p.username); }
    catch { setMemberFound(null); }
    finally { setMemberSearching(false); }
  };
  // 이미 고른 멤버(친구 목록에서 고른 회원 친구 포함)나 이미 그룹에 있는 멤버와 같은 계정인지
  const memberAlreadyAdded = (prof) => !!prof && (
    customMembers.some((m) => m.username && m.username === prof.username)
    || selectedFriendIds.some((id) => friends.find((f) => f.id === id)?.friend_user_id === prof.id)
    || existingUserIds.includes(prof.id) || existingUsernames.includes(prof.username)
  );
  const addFoundMember = () => {
    const nn = memberNickname.trim();
    if (!memberFound || !nn) return;
    const blocked = memberFound.allow_group_invite === false;
    if (blocked) showToast(`${nn} 님은 그룹 초대 비허용 상태입니다`);
    setCustomMembers((ms) => [...ms, { nickname: nn, username: memberFound.username, memo: '', invite: !blocked, blocked }]);
    setMemberQuery(''); setMemberFound(undefined); setMemberNickname('');
  };
  const addGuest = () => {
    const nn = guestName.trim();
    if (!nn) return;
    setCustomMembers((ms) => [...ms, { nickname: nn, username: '', memo: guestMemo.trim(), invite: false, blocked: false }]);
    setGuestName(''); setGuestMemo('');
  };

  // 고른 멤버를 그룹에 추가. 실패한 멤버는 "닉네임: 사유" 목록으로 돌려준다.
  const addAll = async (groupId, startDate) => {
    const errors = [];
    for (const fid of selectedFriendIds) {
      const f = friends.find((x) => x.id === fid);
      if (!f) continue;
      try {
        // 초대 토글을 끈 회원 친구는 아이디 없이(외부 멤버로, 표시용 아이디만) 추가. 친구 메모는 멤버 메모로.
        const invite = friendInvites(f);
        await db.addMember(groupId, { nickname: f.nickname, username: invite ? (f.friend?.username || '') : '', externalUsername: !invite ? (f.friend?.username || '') : '', start_date: startDate, end_date: '', contact: '', memo: f.memo || '' });
      } catch (e) { errors.push(`${f.nickname}: ${e.message}`); }
    }
    for (const cm of customMembers) {
      try {
        await db.addMember(groupId, { nickname: cm.nickname, username: cm.username && cm.invite ? cm.username : '', externalUsername: cm.username && !cm.invite ? cm.username : '', start_date: startDate, end_date: '', contact: '', memo: cm.memo || '' });
      } catch (e) { errors.push(`${cm.nickname}: ${e.message}`); }
    }
    return errors;
  };

  const q = friendQuery.trim().toLowerCase();
  const filteredFriends = friends.filter((f) => !q || f.nickname.toLowerCase().includes(q));
  // 친구 관리 페이지와 같은 구성·순서: 친구 그룹 순서대로, 그룹 안에서는 닉네임 가나다순, 마지막에 그룹 없음.
  const friendSections = (() => {
    const byName = (a, b) => a.nickname.localeCompare(b.nickname, 'ko');
    const byGroup = new Map(friendGroups.map((g) => [g.id, []]));
    const ungrouped = [];
    for (const f of filteredFriends) {
      if (f.group_id && byGroup.has(f.group_id)) byGroup.get(f.group_id).push(f);
      else ungrouped.push(f);
    }
    const list = friendGroups.map((g) => ({ group: g, items: byGroup.get(g.id).sort(byName) })).filter((x) => x.items.length);
    if (ungrouped.length) list.push({ group: null, items: ungrouped.sort(byName) });
    return list;
  })();
  const selectedChips = [
    ...selectedFriendIds.map((id) => {
      const f = friends.find((x) => x.id === id);
      return { key: `f${id}`, name: f?.nickname || '', invite: friendInvites(f), onRemove: () => removeFriend(id) };
    }),
    ...customMembers.map((m, idx) => ({ key: `c${idx}`, name: m.nickname, invite: !!(m.username && m.invite), onRemove: () => removeCustom(idx) })),
  ];

  // 멤버를 새로 추가하면 선택 목록을 오른쪽 끝(방금 추가한 멤버)으로 스크롤
  const chipCountRef = useRef(0);
  useEffect(() => {
    const el = chipsRef.current;
    if (el && selectedChips.length > chipCountRef.current) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    chipCountRef.current = selectedChips.length;
  }, [selectedChips.length]);

  // 고정 영역: 선택 알약 + 탭 + 검색창
  const header = (
    <>
      {selectedChips.length > 0 && (
        // 선택한 멤버는 한 줄로 고정하고 좌우로 스크롤(새로 추가하면 끝으로 자동 스크롤)
        <div ref={chipsRef} className="hscroll-chips" style={{ display: 'flex', flexWrap: 'nowrap', gap: 7, marginBottom: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {selectedChips.map((chip) => (
            // 초대장을 받는 멤버는 옅은 코랄 핑크→주황 그라데이션
            <span key={chip.key} style={{ flex: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 8px 7px 12px', background: chip.invite ? 'linear-gradient(90deg, #FDE2E8, #FFE9D6)' : 'var(--k-bg-f4f2f0)', borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--k-tx-191722)' }}>
              {chip.name}
              <button aria-label="제거" onClick={chip.onRemove} style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'rgba(25,23,34,.08)', color: 'var(--k-tx-6c6779)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flex: 'none' }}>
                <svg width="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: 4, marginBottom: 14 }}>
        {[['friends', '친구 목록'], ['member', '회원'], ['guest', '비회원']].map(([t, label]) => (
          <button key={t} type="button" onClick={() => setMemberTab(t)} style={{
            flex: 1, border: 'none', borderRadius: 999, padding: '10px 0', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: memberTab === t ? 'var(--k-bg-fff)' : 'transparent', color: memberTab === t ? 'var(--k-tx-191722)' : 'var(--k-tx-8b8798)',
          }}>{label}</button>
        ))}
      </div>
      {memberTab === 'friends' && (
        <div style={{ position: 'relative' }}>
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text" placeholder="친구 닉네임 검색" value={friendQuery} onChange={(e) => setFriendQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 999, padding: '12px 16px 12px 40px', outline: 'none' }}
          />
        </div>
      )}
      {/* 회원 탭: 친구 추가 페이지의 회원 검색과 같은 방식(엔터/검색 버튼으로 검색, 아이디 정확히 일치) */}
      {memberTab === 'member' && (
        <form onSubmit={searchMember} style={{ position: 'relative', marginBottom: 2 }}>
          <button type="submit" aria-label="검색" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" viewBox="0 0 24 24" fill="none" stroke="#a29ead" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
          <input
            type="search" enterKeyHint="search" className="plain-search" placeholder="가캣부 아이디 검색" value={memberQuery}
            onChange={(e) => { const v = e.target.value.replace(/\s/g, ''); setMemberQuery(v); if (!v) setMemberFound(undefined); }}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 999, padding: '12px 16px 12px 40px', outline: 'none', WebkitAppearance: 'none', appearance: 'none' }}
          />
        </form>
      )}
    </>
  );

  // 스크롤 영역: 친구 목록 / 회원 검색 결과 / 비회원 입력
  const body = (
    <div>
      {memberTab === 'friends' && (friendSections.length === 0 ? (
        <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', marginBottom: 16, padding: '20px 14px', textAlign: 'center', fontSize: 12.5, color: 'var(--k-tx-a29ead)' }}>
          {friends.length ? '검색 결과가 없어요' : '등록된 친구가 없어요'}
        </div>
      ) : friendSections.map(({ group, items }) => (
        <div key={group?.id ?? '_ungrouped'} style={{ marginBottom: 16 }}>
          <div style={{ padding: '0 8px 0 18px', marginBottom: 8, fontSize: 13, fontWeight: 700, color: group ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}>
            {group ? group.name : '그룹 없음'}
          </div>
          <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', overflow: 'hidden' }}>
            {items.map((f, i) => {
              const selected = selectedFriendIds.includes(f.id);
              const existing = isExistingFriend(f);
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)' }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 13.25, fontWeight: 600, color: existing ? 'var(--k-tx-a29ead)' : 'var(--k-tx-191722)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nickname}</span>
                    {f.friend_user_id && f.friend?.username && (
                      <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>@{f.friend.username}</span>
                    )}
                  </div>
                  {existing ? (
                    // 이미 그룹에 있는 친구
                    <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 700, color: 'var(--k-tx-a29ead)' }}>멤버</span>
                  ) : (
                    <>
                      {f.friend_user_id && (
                        // 초대 여부 토글: 켜짐 = 그룹 초대장 전송, 꺼짐 = 외부 멤버로 추가
                        <InviteButton on={friendInvites(f)} onClick={() => toggleInvite(f)} />
                      )}
                      <button
                        aria-label={selected ? '추가됨' : '추가'} onClick={() => toggleFriend(f.id)}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: selected ? '#d9f1ec' : 'var(--k-bg-f4f2f0)', color: selected ? '#2e9e85' : 'var(--k-tx-8b8798)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', padding: 0 }}
                      >
                        {selected ? (
                          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        )}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )))}

      {memberTab === 'member' && (
        memberFound === null ? (
          <div style={{ padding: '60px 0', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.6, fontSize: 13, color: 'var(--k-tx-a29ead)' }}>
            {'일치하는 회원이 존재하지 않습니다.\n비회원 탭에서 추가해 주세요.'}
          </div>
        ) : memberFound ? (() => {
          const isSelf = memberFound.id === userId;
          const added = memberAlreadyAdded(memberFound);
          return (
            <>
              <div style={{ marginTop: 16, background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{memberFound.display_name || memberFound.username}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--k-tx-a29ead)' }}>@{memberFound.username}</div>
                {(isSelf || added) && (
                  <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{isSelf ? '본인 아이디입니다.' : '이미 추가된 멤버입니다.'}</div>
                )}
              </div>
              {!isSelf && !added && (
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>그룹 닉네임</span>
                    <input type="text" value={memberNickname} onChange={(e) => setMemberNickname(e.target.value)} placeholder="그룹 내에서 보일 닉네임" style={fieldStyle} />
                  </label>
                  <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 48, fontSize: 14 }} disabled={!memberNickname.trim()} onClick={addFoundMember}>멤버 추가</button>
                </div>
              )}
            </>
          );
        })() : null
      )}

      {memberTab === 'guest' && (
        // 비회원 = 외부 멤버(초대장 없음)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="그룹 내에서 보일 이름" style={fieldStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>메모<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span></span>
            <textarea value={guestMemo} onChange={(e) => setGuestMemo(e.target.value)} placeholder="총무만 볼 수 있는 메모" rows={3} style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }} />
          </label>
          <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 48, fontSize: 14 }} disabled={!guestName.trim()} onClick={addGuest}>멤버 추가</button>
        </div>
      )}
    </div>
  );

  // 헤더 없는 확인 모달: 초대장 받을 멤버 목록(여기서도 초대 해제 가능)
  const confirmModal = ({ open, onClose, onConfirm, busy, label }) => (open ? (
    <div className="catmodal-overlay" onClick={onClose}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--k-tx-191722)', textAlign: 'center', padding: '6px 0 2px' }}>다음 멤버에게 초대장이 발송됩니다.</div>
        <div style={{ background: 'var(--k-bg-faf9f8)', borderRadius: 14, maxHeight: '45vh', overflowY: 'auto' }}>
          {invitees.map((x, i) => (
            <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--k-divider)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.25, fontWeight: 600, color: x.on ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nickname}</span>
              <InviteButton on={x.on} onClick={x.toggle} />
            </div>
          ))}
        </div>
        <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 46, fontSize: 14 }} disabled={busy} onClick={onConfirm}>{label}</button>
      </div>
    </div>
  ) : null);

  const toastEl = toast ? <div key={toastKey} className="settle-toast">{toast}</div> : null;

  return { header, body, confirmModal, toastEl, hasInvites, selectedCount, addAll, memberTab };
}

// 본문 스크롤 영역: 내용이 화면 안에 다 들어오면 스크롤(=바운스) 자체를 끄고, 넘칠 때만 스크롤.
// 페이지(문서) 자체의 바운스도 꺼서 상단 고정 영역이 끌려 움직이지 않게 한다.
export function useFixedHeaderScroll(bodyRef, deps) {
  useEffect(() => {
    const el = document.documentElement;
    const prevHtml = el.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    el.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => { el.style.overscrollBehaviorY = prevHtml; document.body.style.overscrollBehaviorY = prevBody; };
  }, []);
  const [scrollable, setScrollable] = useState(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      const inner = el.firstElementChild;
      const contentH = inner ? inner.getBoundingClientRect().height : el.scrollHeight;
      const cs = getComputedStyle(el);
      const avail = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setScrollable(contentH > avail + 1);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scrollable;
}
