import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { dotDate } from '../lib/format.js';
import { DayCardRow } from './TransactionList.jsx';

// 그룹 멤버 관리 (계정/외부 멤버 공통). owner(총무/총대)만 추가·수정·삭제.
export default function MembersPanel({ groupId, members, isOwner, leaderName, onReload }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록
  // 내 친구로 등록된 회원(user id) — 이 회원들과 나 자신은 닉네임 옆에 @아이디 표시
  const [friendUserIds, setFriendUserIds] = useState([]);
  const [friendUsernames, setFriendUsernames] = useState([]);
  useEffect(() => {
    db.listFriends().then((fs) => {
      setFriendUserIds(fs.map((f) => f.friend_user_id).filter(Boolean));
      setFriendUsernames(fs.map((f) => f.friend?.username).filter(Boolean));
    }).catch(() => {});
  }, []);

  // 멤버 추가·수정은 별도 페이지(그룹 만들기의 멤버 추가 단계와 같은 구성 / 멤버 수정 페이지)
  const openAdd = () => nav(`/groups/${groupId}/members/add`);
  const openEdit = (m) => nav(`/groups/${groupId}/members/${m.id}/edit`);

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
          // 본인·내 친구인 회원은 @아이디(초대하지 않아 외부 멤버로 추가된 회원은 표시용 아이디)
          const idText = m.is_account
            ? (m.username && (m.user_id === user?.id || friendUserIds.includes(m.user_id)) ? m.username : null)
            : (m.external_username && friendUsernames.includes(m.external_username) ? m.external_username : null);
          const canRemove = isOwner && m.role !== 'owner';
          return (
            <DayCardRow
              key={m.id} index={i} count={visibleMembers.length} clickable={isOwner}
              isOpen={openId === m.id} onOpenChange={(open) => setOpenId(open ? m.id : null)}
              onTap={isOwner ? () => openEdit(m) : undefined} onDelete={canRemove ? () => remove(m) : undefined}
            >
              <div style={{ flex: 1, minWidth: 0, padding: '1px 0 1px 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{m.nickname}</span>
                    {idText && <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--k-tx-a29ead)' }}>@{idText}</span>}
                    {m.role === 'owner' && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 6px' }}>{leaderName}</span>}
                    {m.role !== 'owner' && m.pending && <span style={{ fontSize: 9, fontWeight: 700, color: '#B8860B', background: '#FBF1D3', borderRadius: 999, padding: '2px 6px' }}>초대중</span>}
                    {m.role !== 'owner' && !m.pending && !m.is_account && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: '2px 6px' }}>외부</span>}
                  </div>
                  {/* 같은 줄 오른쪽 끝: {시작일자} ~ {종료일자(없으면 생략)} */}
                  {m.start_date && (
                    <span style={{ flex: 'none', fontSize: 10.5, color: 'var(--k-tx-a29ead)', whiteSpace: 'nowrap' }}>
                      {dotDate(m.start_date)} ~{m.end_date ? ` ${dotDate(m.end_date)}` : ''}
                    </span>
                  )}
                </div>
                {/* 두 번째 줄: 메모(총무만 열람) */}
                {isOwner && m.memo && <div style={{ marginTop: 3, fontSize: 10.75, color: 'var(--k-tx-8b8798)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.memo}</div>}
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

    </>
  );
}
