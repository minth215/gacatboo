import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { useMemberPicker, useFixedHeaderScroll } from '../components/MemberPicker.jsx';

// 그룹 상세 > 멤버 탭 > 멤버 추가 페이지. 그룹 만들기의 "멤버 추가" 단계와 같은 구성
// (친구 목록/회원/비회원 탭, 초대 토글, 초대장 발송 확인). 상단 고정 영역 아래 본문만 스크롤.
export default function GroupMemberAdd() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    db.getGroup(gid).then(({ group: g, members: ms }) => { setGroup(g); setMembers(ms); }).catch((e) => { alert(e.message); nav(-1); });
  }, [gid, nav]);

  const picker = useMemberPicker({ userId: user.id, existingMembers: members });
  const bodyScrollable = useFixedHeaderScroll(bodyRef, [!!group]);

  const submit = async () => {
    if (busy || !picker.selectedCount) return;
    setBusy(true);
    try {
      // 새로 추가하는 멤버의 시작일자는 오늘
      const errors = await picker.addAll(gid, today());
      if (errors.length) alert('일부 멤버를 추가하지 못했습니다.\n' + errors.join('\n'));
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };
  const onAdd = () => {
    if (!picker.selectedCount) return;
    if (picker.hasInvites) { setConfirmOpen(true); return; }
    submit();
  };

  const disabled = busy || !picker.selectedCount;
  return (
    // 높이 = 화면 - 컨테이너 위아래 여백(16×2). 위 여백 44 는 고정 상단바 자리.
    <div style={{ padding: '44px 0 0', boxSizing: 'border-box', height: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="멤버 추가" flat right={(
        // 텍스트 버튼: 고른 멤버가 없으면 회색, 있으면 코랄 핑크
        <button
          type="button" onClick={onAdd} disabled={disabled}
          style={{ height: 32, padding: '0 4px', fontFamily: 'inherit', border: 'none', background: 'transparent', color: disabled ? 'var(--k-tx-b6b2c0)' : '#FF3B5C', fontSize: 14.5, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >{busy ? '추가 중…' : '추가'}</button>
      )} />

      {!group ? <Spinner /> : group.owner_id !== user.id ? (
        <div className="empty empty-center">총무만 멤버를 추가할 수 있습니다.</div>
      ) : (
        <>
          {/* 선택 목록·탭·검색창: 스크롤 영역 밖이라 움직이지 않음 */}
          <div style={{ flex: 'none', margin: '-4px -16px 0', padding: '8px 16px 14px' }}>{picker.header}</div>
          <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: bodyScrollable ? 'auto' : 'hidden', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', margin: '0 -16px', padding: '6px 16px 16px' }}>
            {picker.body}
          </div>
        </>
      )}

      {picker.toastEl}
      {picker.confirmModal({
        open: confirmOpen, onClose: () => setConfirmOpen(false), busy,
        onConfirm: () => { setConfirmOpen(false); submit(); }, label: busy ? '추가 중…' : '추가',
      })}
    </div>
  );
}
