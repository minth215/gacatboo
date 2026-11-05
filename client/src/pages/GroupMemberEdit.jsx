import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { dotDate } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

// 그룹 상세 > 멤버 탭 > 멤버 카드 → 멤버 수정 페이지(총무만). 이름/시작일자/종료일자/메모.
// 연락처는 쓰지 않아 화면에 두지 않는다(저장 시 기존 값 그대로 유지).
const fieldStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)',
  border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' };
const optional = <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-tx-b0b0b8)', marginLeft: 2 }}> 선택</span>;

// 보이는 글자는 직접 그리고 실제 <input type="date">를 투명하게 덮어 탭만 받는 날짜 칸
function DateBox({ value, onChange }) {
  return (
    <div style={{ ...fieldStyle, position: 'relative' }}>
      <span style={{ color: value ? 'var(--k-tx-191722)' : 'var(--k-tx-b6b2c0)' }}>{value ? dotDate(value) : '날짜 선택'}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', cursor: 'pointer' }} />
    </div>
  );
}

export default function GroupMemberEdit() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [member, setMember] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [linkOpen, setLinkOpen] = useState(false); // 회원 연결 모달

  useEffect(() => {
    db.getGroup(gid).then(({ group: g, members }) => {
      const m = members.find((x) => x.id === mid);
      if (!m) { alert('멤버를 찾을 수 없습니다.'); nav(-1); return; }
      setGroup(g); setMember(m); setAllMembers(members);
      setForm({ nickname: m.owner_nickname || m.nickname || '', start_date: m.start_date || '', end_date: m.end_date || '', memo: m.memo || '', ext: m.external_username || '' });
    }).catch((e) => { alert(e.message); nav(-1); });
  }, [gid, mid, nav]);

  const save = async () => {
    if (!form.nickname.trim()) return alert('이름을 입력하세요.');
    if (!form.start_date) return alert('시작일자를 입력하세요.');
    if (busy) return;
    setBusy(true);
    try {
      // 회원 연결/해제(외부 멤버의 표시용 아이디)가 바뀌었을 때만 함께 저장
      const extChanged = form.ext !== (member.external_username || '');
      await db.updateMember(mid, gid, { ...form, contact: member.contact || '', ...(extChanged ? { external_username: form.ext } : {}) });
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  // 회원(계정 연결 또는 초대 없이 외부 멤버로 추가)의 아이디: 닉네임 칸 오른쪽에 고정
  // 계정이 연결된(초대됨/수락) 멤버는 그 아이디, 외부 멤버는 연결한 표시용 아이디(해제 가능)
  const memberUsername = member?.is_account ? (member?.username || '') : (form?.ext || '');
  const canUnlink = !!member && !member.is_account && !!form?.ext;
  const unlink = () => { if (confirm('회원 연결을 해제할까요?')) setForm((f) => ({ ...f, ext: '' })); };
  // 초대 없이 외부 멤버로 추가한 회원은 뒤늦게라도 초대할 수 있다
  const canInvite = !!member && !member.is_account && !!member.external_username && form?.ext === member.external_username;
  const invite = async () => {
    if (!confirm('멤버를 초대할까요?')) return;
    try {
      await db.inviteExternalMember(gid, member);
      setMember((m) => ({ ...m, is_account: true, pending: true, username: m.external_username }));
      alert('초대장을 보냈습니다.');
    } catch (e) { alert(e.message); }
  };

  if (!form) return <Spinner />;
  if (group.owner_id !== user.id) return <div className="empty empty-center">총무만 멤버 정보를 수정할 수 있습니다.</div>;

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title="멤버 수정" flat right={canInvite && (
        <button type="button" className="tb-icon-btn" onClick={invite} aria-label="초대">
          <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" />
          </svg>
        </button>
      )} />
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
            <input
              type="text" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="그룹 내에서 보일 이름"
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', outline: 'none', padding: '14px 0' }}
            />
            {memberUsername ? (
              // 외부 멤버에 연결한 아이디는 눌러서 연결 해제(초대된 멤버는 불가)
              <span
                onClick={canUnlink ? (e) => { e.preventDefault(); unlink(); } : undefined}
                style={{ flex: 'none', fontSize: 12, fontWeight: 400, color: 'var(--k-tx-a29ead)', cursor: canUnlink ? 'pointer' : 'default' }}
              >@{memberUsername}</span>
            ) : (
              // 회원이 아닌 멤버: 친구 정보 수정 페이지처럼 "회원 연결" 배지 → 친구 목록/회원 검색 모달
              <button
                type="button" onClick={(e) => { e.preventDefault(); setLinkOpen(true); }}
                style={{ flex: 'none', border: 'none', borderRadius: 999, background: 'var(--k-bg-efeef2)', color: 'var(--k-tx-6c6779)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}
              >회원 연결</button>
            )}
          </div>
          {/* 멤버가 수락하며 정한 닉네임(다른 멤버들에게는 이 이름으로 보임) */}
          {member?.self_nickname && member.self_nickname !== form.nickname && (
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--k-tx-a29ead)', paddingLeft: 2 }}>멤버가 설정한 닉네임: {member.self_nickname}</span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>시작일자 <span style={{ color: '#FF3B5C' }}>*</span></span>
            <DateBox value={form.start_date} onChange={(v) => setForm((f) => ({ ...f, start_date: v }))} />
          </label>
          <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={labelStyle}>종료일자{optional}</span>
            <DateBox value={form.end_date} onChange={(v) => setForm((f) => ({ ...f, end_date: v }))} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>메모{optional}</span>
          <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="총무만 볼 수 있는 메모" rows={3} style={{ ...fieldStyle, lineHeight: 1.5, resize: 'none' }} />
        </label>
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.nickname.trim() || !form.start_date} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
      {linkOpen && (
        <MemberLinkModal
          userId={user.id} members={allMembers} onClose={() => setLinkOpen(false)}
          onPick={(username) => { setForm((f) => ({ ...f, ext: username })); setLinkOpen(false); }}
        />
      )}
    </div>
  );
}

// "회원 연결" 모달: 친구 목록(회원인 친구) / 회원(아이디 검색 — 엔터·검색 버튼, 정확히 일치) 탭.
// 고른 회원의 아이디를 이 멤버의 표시용 아이디로 연결한다(저장 시 반영, 이후 상단바 초대 버튼으로 초대 가능).
function MemberLinkModal({ userId, members, onClose, onPick }) {
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(undefined); // undefined(검색 전) | null(없음) | profile
  const [searching, setSearching] = useState(false);
  useEffect(() => { db.listFriends().then((fs) => setFriends(fs.filter((f) => f.friend_user_id && f.friend?.username))).catch(() => {}); }, []);

  // 이미 이 그룹에 있는 회원(계정 연결 또는 표시용 아이디)은 연결할 수 없음
  const taken = new Set(members.flatMap((m) => [m.username, m.external_username]).filter(Boolean));
  const search = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    try { setFound(await db.findProfileByUsername(q)); } catch { setFound(null); } finally { setSearching(false); }
  };

  return (
    <div className="catmodal-overlay" onClick={onClose}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>회원 연결</div>
          <button aria-label="닫기" onClick={onClose} className="catmodal-icon-btn">
            <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: 4, flex: 'none' }}>
          {[['friends', '친구 목록'], ['member', '회원']].map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} style={{
              flex: 1, border: 'none', borderRadius: 999, padding: '9px 0', fontFamily: 'inherit', fontSize: 12.75, fontWeight: 700, cursor: 'pointer',
              background: tab === t ? 'var(--k-bg-fff)' : 'transparent', color: tab === t ? 'var(--k-tx-191722)' : 'var(--k-tx-8b8798)',
            }}>{label}</button>
          ))}
        </div>

        {tab === 'friends' ? (
          <div style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', background: 'var(--k-bg-faf9f8)', borderRadius: 14 }}>
            {friends.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--k-tx-a29ead)' }}>회원인 친구가 없어요</div>
            ) : friends.map((f, i) => {
              const isTaken = taken.has(f.friend.username);
              return (
                <button
                  key={f.id} type="button" disabled={isTaken} onClick={() => onPick(f.friend.username)}
                  style={{ width: '100%', display: 'flex', alignItems: 'baseline', gap: 6, padding: '12px 16px', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--k-divider)', background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: isTaken ? 'default' : 'pointer' }}
                >
                  <span style={{ fontSize: 13.25, fontWeight: 600, color: isTaken ? 'var(--k-tx-a29ead)' : 'var(--k-tx-191722)' }}>{f.nickname}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--k-tx-a29ead)' }}>@{f.friend.username}</span>
                  {isTaken && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--k-tx-a29ead)' }}>멤버</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <form onSubmit={search} style={{ position: 'relative', flex: 'none' }}>
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
              <div style={{ padding: '14px 0 4px', textAlign: 'center', fontSize: 12.75, color: 'var(--k-tx-a29ead)' }}>일치하는 회원이 존재하지 않습니다.</div>
            ) : found ? (() => {
              const isSelf = found.id === userId;
              const isTaken = taken.has(found.username);
              return (
                <>
                  <div style={{ background: 'var(--k-bg-faf9f8)', borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{found.display_name || found.username}</div>
                    <div style={{ marginTop: 3, fontSize: 12, color: 'var(--k-tx-a29ead)' }}>@{found.username}</div>
                    {(isSelf || isTaken) && <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{isSelf ? '본인 아이디입니다.' : '이미 이 그룹의 멤버입니다.'}</div>}
                  </div>
                  {!isSelf && !isTaken && (
                    <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} onClick={() => onPick(found.username)}>이 회원과 연결</button>
                  )}
                </>
              );
            })() : null}
          </>
        )}
      </div>
    </div>
  );
}
