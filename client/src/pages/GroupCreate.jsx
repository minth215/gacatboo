import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';

const PALETTE = ['#EEEBFE', '#E8F4EC', '#FDEEE6', '#E6EEFD', '#FDE8EE', '#FBF1D3', '#FDE2E2'];
const STEP_LABELS = ['그룹 정보', '내 정보', '멤버 추가'];

const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)',
  border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

// 초대장 토글 버튼: 켜짐 = 검은 원 + 흰 편지지, 꺼짐 = 회색 원 + 원 끝까지 닿는 빗금
function InviteButton({ on, onClick }) {
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

export default function GroupCreate() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [groupCats, setGroupCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [friends, setFriends] = useState([]);
  const [friendGroups, setFriendGroups] = useState([]); // 친구 관리의 친구 분류(카테고리)
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 스텝 1: 그룹 정보
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');

  // 스텝 2: 내 정보
  const [nickname, setNickname] = useState(user.display_name || '');
  const [depositSourceId, setDepositSourceId] = useState('');

  // 스텝 3: 멤버 추가
  const [friendQuery, setFriendQuery] = useState('');
  const chipsRef = useRef(null);
  const bodyRef = useRef(null); // 단계 본문 스크롤 영역
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [customMembers, setCustomMembers] = useState([]); // [{ nickname, username, memo, invite, blocked }] — 회원 탭(username 있음)/비회원 탭(외부 멤버)
  const [confirmOpen, setConfirmOpen] = useState(false); // 만들기 전 초대장 발송 확인 모달
  // 멤버 추가 탭: 친구 목록 | 회원 | 비회원 — 세 탭에서 고른 멤버가 한 목록(selectedChips)으로 합쳐진다
  const [memberTab, setMemberTab] = useState('friends');
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
    db.listGroupCategories().then((cs) => {
      setGroupCats(cs);
      setCategory((c) => c || cs[0]?.name || '');
    }).catch(() => {});
    db.listSources().then((s) => {
      setSources(s);
      // 주입금수단이 세부 항목을 가진 원천 그룹이면(그룹 자체는 선택 불가) 기본값으로 쓰지 않음
      const primary = s.flat.find((x) => x.is_primary_deposit && !s.tree.find((t) => t.id === x.id)?.children?.length);
      if (primary) setDepositSourceId(String(primary.id));
    }).catch(() => {});
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

  // 스텝 바는 항상 고정: 이 화면에서는 문서(페이지) 자체의 바운스를 끄고, 본문 스크롤 영역만
  // 내용이 넘칠 때(실제로 스크롤될 때) 그 안에서 바운스되게 한다.
  useEffect(() => {
    const el = document.documentElement;
    const prevHtml = el.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    el.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => { el.style.overscrollBehaviorY = prevHtml; document.body.style.overscrollBehaviorY = prevBody; };
  }, []);

  // 본문이 화면 안에 다 들어오면 스크롤(=바운스) 자체를 끔. 작은 화면 등 넘칠 때만 스크롤.
  const [bodyScrollable, setBodyScrollable] = useState(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      const inner = el.firstElementChild;
      const contentH = inner ? inner.getBoundingClientRect().height : el.scrollHeight;
      const cs = getComputedStyle(el);
      const avail = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setBodyScrollable(contentH > avail + 1);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, [step]);

  // 단계가 바뀌면 이전 단계의 스크롤 위치를 이어받지 않도록 맨 위로
  useEffect(() => {
    window.scrollTo(0, 0);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  const step1Invalid = !name.trim() || !category;
  const nextDisabled = step === 1 && step1Invalid;

  const onBack = () => { if (step > 1) setStep(step - 1); else nav('/groups'); };

  const toggleFriend = (id) => {
    setSelectedFriendIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };
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

  const searchMember = async (e) => {
    e?.preventDefault();
    const q = memberQuery.trim();
    if (!q || memberSearching) return;
    setMemberSearching(true);
    try { const p = await db.findProfileByUsername(q); setMemberFound(p); setMemberNickname(p.display_name || p.username); }
    catch { setMemberFound(null); }
    finally { setMemberSearching(false); }
  };
  // 이미 고른 멤버(친구 목록에서 고른 회원 친구 포함)와 같은 계정인지
  const memberAlreadyAdded = (prof) => !!prof && (
    customMembers.some((m) => m.username && m.username === prof.username)
    || selectedFriendIds.some((id) => friends.find((f) => f.id === id)?.friend_user_id === prof.id)
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

  const submit = async () => {
    if (step1Invalid) { setStep(1); return; }
    setError(''); setBusy(true);
    try {
      const g = await db.createGroup(user.id, {
        name: name.trim(), description: comment, category, category_emoji: emoji, color,
        start_date: startDate, end_date: endDate, nickname,
      });
      if (depositSourceId) {
        const src = sources.flat.find((s) => String(s.id) === String(depositSourceId));
        try { await db.upsertSubscription(g.id, { deposit_source_id: Number(depositSourceId), deposit_source_name: src?.name || '' }); } catch {}
      }
      const memberErrors = [];
      for (const fid of selectedFriendIds) {
        const f = friends.find((x) => x.id === fid);
        if (!f) continue;
        try {
          // 초대 토글을 끈 회원 친구는 아이디 없이(외부 멤버로) 추가
          const invite = friendInvites(f);
          await db.addMember(g.id, { nickname: f.nickname, username: invite ? (f.friend?.username || '') : '', start_date: startDate, end_date: '', contact: '', memo: '' });
        } catch (e) { memberErrors.push(`${f.nickname}: ${e.message}`); }
      }
      for (const cm of customMembers) {
        try {
          // 초대를 끈 회원은 아이디 없이(외부 멤버로)
          await db.addMember(g.id, { nickname: cm.nickname, username: cm.username && cm.invite ? cm.username : '', start_date: startDate, end_date: '', contact: '', memo: cm.memo || '' });
        } catch (e) { memberErrors.push(`${cm.nickname}: ${e.message}`); }
      }
      if (memberErrors.length) alert('일부 멤버를 추가하지 못했습니다.\n' + memberErrors.join('\n'));
      // 생성 화면을 상세 화면으로 바꿔치기(replace) — 상세에서 "<"를 누르면 그룹 목록으로 돌아감
      nav(`/groups/${g.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const goNext = () => {
    if (nextDisabled) return;
    if (step < 3) { setStep(step + 1); return; }
    // 초대장을 보낼 멤버가 있으면 한 번 더 확인
    if (invitees.some((x) => x.on)) { setConfirmOpen(true); return; }
    submit();
  };

  const q = friendQuery.trim().toLowerCase();
  const filteredFriends = friends.filter((f) => !q || f.nickname.toLowerCase().includes(q));
  // 친구 관리 페이지와 같은 구성·순서: 친구 분류 순서대로, 분류 안에서는 닉네임 가나다순, 마지막에 미분류.
  // 검색 중에는 일치하는 친구가 있는 분류만 보인다.
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

  return (
    // 페이지 자체는 화면 높이에 맞춰 스크롤하지 않고, 스텝 바 아래 본문만 스크롤(바운스도 본문 안에서만)
    // 높이 = 화면 - 컨테이너 위아래 여백(16×2). 위 여백 44 는 고정 상단바 자리.
    <div style={{ padding: '44px 0 0', boxSizing: 'border-box', height: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="그룹 만들기" flat onBack={onBack} right={(
        // 단계 이동은 상단바 오른쪽 버튼(이전 단계는 "<")
        <button
          type="button" onClick={goNext} disabled={nextDisabled || busy}
          // 텍스트 버튼: 비활성 회색, 활성 코랄 핑크
          style={{ height: 32, padding: '0 4px', fontFamily: 'inherit', border: 'none', background: 'transparent', color: (nextDisabled || busy) ? 'var(--k-tx-b6b2c0)' : '#FF3B5C', fontSize: 14.5, fontWeight: 800, cursor: (nextDisabled || busy) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {busy ? '만드는 중…' : step < 3 ? '다음' : '만들기'}
        </button>
      )} />

      {/* 스텝 표시(+ 멤버 추가 단계의 선택 목록·탭·검색창): 스크롤해도 상단바 아래에 고정 */}
      {/* 스텝 바(+ 멤버 추가 단계의 선택 목록·탭·검색창): 스크롤 영역 밖이라 움직이지 않음. 상단바 바로 아래(56px) */}
      <div style={{ flex: 'none', margin: '-4px -16px 0', padding: '6px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: num < 3 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', background: done || active ? '#FF3B5C' : 'var(--k-bg-efeef2)',
                  color: done || active ? '#fff' : 'var(--k-tx-a29ead)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flex: 'none',
                }}>
                  {done ? (
                    <svg width="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : num}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: done || active ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              {num < 3 && <span style={{ flex: 1, height: 2, background: step > num ? '#FF3B5C' : 'var(--k-bg-efeef2)', margin: '0 6px 16px' }} />}
            </div>
          );
        })}
      </div>
          {step === 3 && (
            <div style={{ marginTop: 18 }}>
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
            </div>
          )}
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: bodyScrollable ? 'auto' : 'hidden', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', margin: '0 -16px', padding: '6px 16px 16px' }}>
        {step === 1 && (
          <div>
            <div style={{ background: 'var(--k-bg-fff)', borderRadius: 20, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', padding: '24px 20px 22px', marginBottom: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ position: 'relative', width: 96, height: 96 }}>
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 26, background: color || 'transparent', border: color ? '1.5px solid var(--k-bd-efeef2)' : 'none',
                    boxShadow: '0 3px 10px rgb(var(--k-sh) / calc(.06 * var(--k-sha)))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 38, pointerEvents: 'none',
                  }}>
                    {emoji || '💸'}
                  </div>
                  <input
                    type="text" value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-1).join(''))} maxLength={2}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', textAlign: 'center', fontSize: 38, fontFamily: 'inherit', color: 'transparent', caretColor: 'var(--k-tx-191722)', background: 'transparent', border: 'none', borderRadius: 26, outline: 'none' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--k-tx-8b8798)' }}>그룹을 나타낼 이모지를 직접 입력해 주세요</div>
                </div>
              </div>

              <div style={{ height: 1, background: '#f0eee9', margin: '0 0 20px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8 }}>
                <button
                  type="button" onClick={() => setColor('')}
                  style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--k-bg-fff)', border: 'none', boxShadow: color === '' ? '0 0 0 2px var(--bg), 0 0 0 4px var(--k-bd-191722)' : 'inset 0 0 0 1.2px rgba(0,0,0,.18)', cursor: 'pointer', padding: 0, position: 'relative', overflow: 'hidden' }}
                >
                  <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0 }}><line x1="6" y1="24" x2="24" y2="6" stroke="#c9455f" strokeWidth="1.3" /></svg>
                </button>
                {PALETTE.map((sw) => (
                  <button
                    type="button" key={sw} aria-label={sw} onClick={() => setColor(sw)}
                    style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: sw, border: 'none', boxShadow: color === sw ? '0 0 0 2px var(--bg), 0 0 0 4px var(--k-bd-191722)' : 'inset 0 0 0 1px rgba(0,0,0,.07)', cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>그룹 이름<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              <input type="text" placeholder="그룹 이름 입력" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>카테고리<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              {groupCats.length === 0 ? (
                <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  카테고리가 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/group-categories')}>편집 ›</button>
                </div>
              ) : (
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...fieldStyle, appearance: 'none' }}>
                  {groupCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </label>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>시작일자<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${startDate ? '' : ' placeholder'}`}>{startDate ? dotDate(startDate) : '날짜 선택'}</div>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="catmodal-date-input" />
                </div>
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>종료일자<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${endDate ? '' : ' placeholder'}`}>{endDate ? dotDate(endDate) : '날짜 선택'}</div>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="catmodal-date-input" />
                </div>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>코멘트<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span></span>
              <textarea
                placeholder="그룹을 소개하는 한마디를 남겨 보세요" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>닉네임<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></span>
              <input type="text" placeholder="그룹 내에서 사용할 닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} style={fieldStyle} />
            </label>

            <div style={{ marginTop: 24, fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)', marginBottom: 3 }}>{category === '공금' ? '공금 관리 수단' : '입금 수단'}<span style={{ color: '#FF3B5C', fontWeight: 800 }}> *</span></div>
            <div style={{ fontSize: 11, color: 'var(--k-tx-a29ead)', marginBottom: 11 }}>
              {category === '공금' ? '초대되는 멤버의 원천에 자동으로 추가됩니다' : '다른 멤버가 입금할 때 받을 원천을 선택하세요'}
            </div>
            {sources.flat.length === 0 ? (
              <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                등록된 원천이 없습니다. <button type="button" className="edit-link" onClick={() => nav('/settings/sources')}>편집 ›</button>
              </div>
            ) : (
              <div style={{ background: 'var(--k-bg-fff)', borderRadius: 18, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', overflow: 'hidden' }}>
                {sources.tree.map((top, gi) => {
                  const topSelected = String(depositSourceId) === String(top.id);
                  const SourceRow = ({ src, selected, indent }) => (
                    <button
                      type="button" onClick={() => setDepositSourceId(String(src.id))}
                      style={{ width: '100%', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, padding: `13px 16px 13px ${16 + indent}px`, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: indent ? 13 : 13.25, fontWeight: indent ? 500 : 600, color: indent ? 'var(--k-tx-4a4652)' : 'var(--k-tx-191722)' }}>{src.name}</div>
                      </div>
                      <span style={{ width: 19, height: 19, borderRadius: '50%', border: `1.5px solid ${selected ? 'var(--k-bd-191722)' : 'var(--k-bd-d8d5de)'}`, background: selected ? 'var(--k-bg-191722)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--k-bg-fff)' }} />}
                      </span>
                    </button>
                  );
                  return (
                    <div key={top.id} style={{ borderTop: gi === 0 ? 'none' : '1.5px solid var(--k-divider)' }}>
                      {top.children?.length ? (
                        // 세부 항목이 있는 원천 그룹은 기록 페이지 원천 셀렉트처럼 선택 불가(제목만)
                        <div style={{ padding: '13px 16px', fontSize: 13.25, fontWeight: 600, color: 'var(--k-tx-191722)' }}>{top.name}</div>
                      ) : (
                        <SourceRow src={top} selected={topSelected} indent={0} />
                      )}
                      {top.children?.map((c) => (
                        <div key={c.id} style={{ borderTop: '1.5px solid var(--k-divider)' }}>
                          <SourceRow src={c} selected={String(depositSourceId) === String(c.id)} indent={16} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            {memberTab === 'friends' && (<>
            {friendSections.length === 0 ? (
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
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i === 0 ? 'none' : '1.5px solid var(--k-divider)' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 13.25, fontWeight: 600, color: 'var(--k-tx-191722)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nickname}</span>
                      {f.friend_user_id && f.friend?.username && (
                        <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>@{f.friend.username}</span>
                      )}
                    </div>
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
                  </div>
                );
                  })}
                </div>
              </div>
            ))}

            </>)}

            {memberTab === 'member' && (
              <>
                {memberFound === null ? (
                  <div style={{ padding: '60px 0', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.6, fontSize: 13, color: 'var(--k-tx-a29ead)' }}>
                    {'일치하는 회원이 존재하지 않습니다.\n비회원 탭에서 추가해 주세요.'}
                  </div>
                ) : memberFound ? (() => {
                  const isSelf = memberFound.id === user.id;
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
                })() : null}
              </>
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
        )}

        {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
      </div>

      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
      {confirmOpen && (
        // 헤더 없는 확인 모달: 초대장 받을 멤버 목록(여기서도 초대 해제 가능)
        <div className="catmodal-overlay" onClick={() => setConfirmOpen(false)}>
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
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 46, fontSize: 14 }} disabled={busy} onClick={() => { setConfirmOpen(false); submit(); }}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
