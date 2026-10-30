import { useEffect, useState } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today, dotDate } from '../lib/format.js';
import { DayCardRow } from './TransactionList.jsx';

// 그룹 멤버 관리 (계정/외부 멤버 공통). owner(총무/총대)만 추가·수정·삭제.
export default function MembersPanel({ groupId, members, isOwner, leaderName, onReload }) {
  const [editor, setEditor] = useState(null); // null | {id?, nickname, start_date, end_date, contact, memo, username}
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록
  // 내 친구로 등록된 회원(user id) — 이 회원들과 나 자신은 닉네임 옆에 @아이디 표시
  const [friendUserIds, setFriendUserIds] = useState([]);
  useEffect(() => {
    db.listFriends().then((fs) => setFriendUserIds(fs.map((f) => f.friend_user_id).filter(Boolean))).catch(() => {});
  }, []);

  const openAdd = () => { setErr(''); setEditor({ nickname: '', start_date: today(), end_date: '', contact: '', memo: '', username: '' }); };
  const openEdit = (m) => {
    setErr('');
    setEditor({ id: m.id, nickname: m.nickname, start_date: m.start_date || '', end_date: m.end_date || '', contact: m.contact || '', memo: m.memo || '', username: m.username || '', is_account: m.is_account });
  };
  const closeModal = () => setEditor(null);

  const save = async () => {
    if (!editor.nickname.trim()) return setErr('이름을 입력하세요.');
    if (!editor.start_date) return setErr('시작일자를 입력하세요.');
    setBusy(true); setErr('');
    try {
      if (editor.id) {
        await db.updateMember(editor.id, groupId, editor);
      } else {
        await db.addMember(groupId, editor);
      }
      closeModal(); onReload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (m.role === 'owner') return;
    if (!confirm(`${m.nickname}님을 그룹에서 제거할까요?`)) return;
    try { await db.removeMember(m.id); onReload(); } catch (e) { alert(e.message); }
  };

  // "짤짤이"는 정산 탭에서 자투리 정산액을 기록하기 위해 자동으로 만들어지는 가상 멤버라
  // 여기서 실수로 수정/삭제되지 않도록 목록에서 제외한다(SubscriptionGroup.jsx 의 LEFTOVER_NAME).
  const visibleMembers = members.filter((m) => m.nickname !== '짤짤이' && m.nickname !== '짤랑이');

  return (
    <>
      {/* 멤버 카드: 총무는 카드를 눌러 수정, 왼쪽으로 밀면 내보내기(가계부 카드와 같은 스와이프) */}
      <div className="tx-daygroup" style={{ marginTop: 14 }}>
        {visibleMembers.map((m, i) => {
          const showId = m.is_account && m.username && (m.user_id === user?.id || friendUserIds.includes(m.user_id));
          const canRemove = isOwner && m.role !== 'owner';
          return (
            <DayCardRow
              key={m.id} index={i} count={visibleMembers.length} clickable={isOwner}
              isOpen={openId === m.id} onOpenChange={(open) => setOpenId(open ? m.id : null)}
              onTap={isOwner ? () => openEdit(m) : undefined} onDelete={canRemove ? () => remove(m) : undefined}
            >
              <div style={{ flex: 1, minWidth: 0, padding: '1px 0 1px 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{m.nickname}</span>
                  {showId && <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>@{m.username}</span>}
                  {m.role === 'owner' && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 6px' }}>{leaderName}</span>}
                  {m.role !== 'owner' && m.pending && <span style={{ fontSize: 9, fontWeight: 700, color: '#B8860B', background: '#FBF1D3', borderRadius: 999, padding: '2px 6px' }}>초대중</span>}
                  {m.role !== 'owner' && !m.pending && !m.is_account && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: '2px 6px' }}>외부</span>}
                </div>
                {/* {시작일자} ~ {종료일자(없으면 생략)} */}
                {m.start_date && (
                  <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--k-tx-a29ead)' }}>
                    {dotDate(m.start_date)} ~{m.end_date ? ` ${dotDate(m.end_date)}` : ''}
                  </div>
                )}
                {isOwner && m.memo && <div style={{ marginTop: 4, fontSize: 10.75, color: 'var(--k-tx-8b8798)' }}>📝 {m.memo}</div>}
              </div>
            </DayCardRow>
          );
        })}
      </div>

      {isOwner && (
        <button className="fab" onClick={openAdd} aria-label="멤버 추가">
          <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      )}

      {editor && (
        <div className="catmodal-overlay" onClick={closeModal}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{editor.id ? '멤버 수정' : '멤버 추가'}</div>
              <button aria-label="닫기" onClick={closeModal} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--k-tx-8b8798)' }}>멤버 이름 <span style={{ color: '#FF3B5C' }}>*</span></span>
              <input value={editor.nickname} onChange={(e) => setEditor({ ...editor, nickname: e.target.value })} placeholder="멤버 이름(닉네임)" autoFocus className="catmodal-name-input" />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--k-tx-8b8798)' }}>시작일자 <span style={{ color: '#FF3B5C' }}>*</span></span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${editor.start_date ? '' : ' placeholder'}`}>{editor.start_date ? dotDate(editor.start_date) : '날짜 선택'}</div>
                  <input type="date" value={editor.start_date} onChange={(e) => setEditor({ ...editor, start_date: e.target.value })} className="catmodal-date-input" />
                </div>
              </label>
              <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--k-tx-8b8798)' }}>종료일자</span>
                <div className="catmodal-date-field">
                  <div className={`catmodal-date-value${editor.end_date ? '' : ' placeholder'}`}>{editor.end_date ? dotDate(editor.end_date) : '날짜 선택'}</div>
                  <input type="date" value={editor.end_date} onChange={(e) => setEditor({ ...editor, end_date: e.target.value })} className="catmodal-date-input" />
                </div>
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--k-tx-8b8798)' }}>연락처</span>
              <input value={editor.contact} onChange={(e) => setEditor({ ...editor, contact: e.target.value })} placeholder="전화번호/이메일 등" className="catmodal-name-input" />
            </label>
            {!editor.id && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--k-tx-8b8798)' }}>가캣부 아이디</span>
                <input value={editor.username} onChange={(e) => setEditor({ ...editor, username: e.target.value })} placeholder="회원일 경우 해당 그룹에 초대됩니다" className="catmodal-name-input" />
              </label>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--k-tx-8b8798)' }}>메모</span>
              <textarea rows={2} value={editor.memo} onChange={(e) => setEditor({ ...editor, memo: e.target.value })} placeholder="총무만 열람 가능합니다" className="catmodal-name-input" style={{ resize: 'none' }} />
            </label>

            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
            <button className="btn-ink-pill" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      )}
    </>
  );
}
