import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { fieldStyle, labelStyle } from './FriendAdd.jsx';
import SourcePick from '../components/SourcePick.jsx';

// 총무/총대는 톱니바퀴 > "내 정보": 내 닉네임·입금 수단(+ 공금 그룹은 출금 수단). 탈퇴 버튼 없음.
// 그룹 상세 > (일반 멤버) 톱니바퀴 > 멤버 정보 수정: 그룹 내 내 닉네임·출금 수단. "수정"을 눌러야 반영.
// 출금 수단을 바꾸면 과거 입금 내역 원천도 바꿀지 묻는다. 상단바 오른쪽 나가기 아이콘 = 그룹 탈퇴.
export default function GroupMyMember() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [me, setMe] = useState(null);
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [askPast, setAskPast] = useState(false); // 과거 입금 내역 원천 일괄 변경 확인
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sub, setSub] = useState(null);

  useEffect(() => {
    Promise.all([db.getGroup(gid), db.listSources(), db.getSubscription(gid).catch(() => null)]).then(([{ group: g, members }, { tree: t }, sb]) => {
      const m = members.find((x) => x.user_id === user.id);
      if (!m) { alert('그룹 멤버가 아닙니다.'); nav(-1); return; }
      setGroup(g); setMe(m); setTree(t); setSub(sb);
      const owner = g.owner_id === user.id;
      setForm({
        nickname: owner ? (m.owner_nickname || m.nickname || '') : (m.self_nickname || m.owner_nickname || m.nickname || ''),
        sourceId: m.withdraw_source_id ? String(m.withdraw_source_id) : '',
        depositSourceId: sb?.deposit_source_id ? String(sb.deposit_source_id) : '',
      });
    }).catch((e) => { alert(e.message); nav(-1); });
  }, [gid, user.id, nav]);

  if (!form) return <Spinner />;
  const isOwner = group?.owner_id === user.id;
  const isPooled = group?.category === '공금';
  const flatOf = () => tree.flatMap((t) => [t, ...(t.children || [])]);
  // 총무/총대 저장: 닉네임·출금 수단은 내 멤버 행, 입금 수단은 그룹 설정(공금 그룹은 공금 통장)
  const saveOwner = async () => {
    if (!form.nickname.trim()) return alert('닉네임을 입력하세요.');
    if (!form.depositSourceId) return alert('입금 수단을 선택하세요.');
    setBusy(true);
    try {
      await db.updateOwnerMember(gid, user.id, { nickname: form.nickname.trim(), ...(isPooled ? { withdraw_source_id: form.sourceId ? Number(form.sourceId) : null } : {}) });
      if (String(sub?.deposit_source_id || '') !== form.depositSourceId) {
        const src = flatOf().find((x) => String(x.id) === form.depositSourceId);
        await db.upsertSubscription(gid, { deposit_source_id: Number(form.depositSourceId), deposit_source_name: src?.name || '' });
      }
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const sourceChanged = String(me.withdraw_source_id || '') !== form.sourceId;
  const doSave = async (applyPast) => {
    setAskPast(false);
    setBusy(true);
    try {
      await db.updateMyGroupMember(me.id, { nickname: form.nickname.trim(), sourceId: form.sourceId, applyPast });
      nav(-1);
    } catch (e) { alert(e.message); setBusy(false); }
  };
  const save = () => {
    if (!form.nickname.trim()) return alert('닉네임을 입력하세요.');
    if (busy) return;
    if (sourceChanged && form.sourceId) { setAskPast(true); return; }
    doSave(false);
  };
  const leave = async (keep) => {
    setLeaveOpen(false);
    setBusy(true);
    try {
      await db.leaveGroup(me.id, keep);
      nav('/groups', { replace: true });
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const selectStyle = { ...fieldStyle, WebkitAppearance: 'none', appearance: 'none', color: form.sourceId ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' };

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title={isOwner ? '내 정보' : '멤버 정보 수정'} flat right={!isOwner && (
        // 그룹 탈퇴(나가기)
        <button className="tb-icon-btn" onClick={() => setLeaveOpen(true)} aria-label="그룹 탈퇴" disabled={busy}>
          <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      )} />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>닉네임 <span style={{ color: '#FF3B5C' }}>*</span></span>
          <input type="text" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="그룹 내에서 보일 닉네임" style={fieldStyle} />
        </label>
        {isOwner ? (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={labelStyle}>{isPooled ? '입금 수단(공금 통장)' : '입금 수단'} <span style={{ color: '#FF3B5C' }}>*</span></span>
              <SourcePick tree={tree} value={form.depositSourceId} onChange={(v) => setForm({ ...form, depositSourceId: v })} placeholder="입금 수단 선택" />
            </label>
            {isPooled && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={labelStyle}>출금 수단</span>
                <SourcePick tree={tree} value={form.sourceId} onChange={(v) => setForm({ ...form, sourceId: v })} placeholder="출금 수단 선택" />
              </label>
            )}
          </>
        ) : (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>출금 수단</span>
          <select value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })} style={selectStyle}>
            <option value="">출금 수단 선택</option>
            {tree.filter((t) => t.children?.length).map((t) => (
              <optgroup key={t.id} label={t.name}>
                {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        )}
        <button type="button" className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy || !form.nickname.trim()} onClick={isOwner ? saveOwner : save}>
          {busy ? '저장 중…' : '수정'}
        </button>
      </div>

      {askPast && (
        <ConfirmModal
          message="과거 입금 내역의 원천을 일괄 변경할까요?"
          onYes={() => doSave(true)} onNo={() => doSave(false)}
        />
      )}

      {leaveOpen && (
        <div className="catmodal-overlay" onClick={() => setLeaveOpen(false)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--k-tx-191722)', margin: '4px 2px 18px', whiteSpace: 'pre-line' }}>
              {`탈퇴 후 [${group?.name || ''}] 그룹의 가계부 내용을 유지할까요?`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button" onClick={() => leave(false)}
                style={{ flex: 1, height: 42, border: 'none', borderRadius: 999, background: 'var(--k-bg-f4f2f0)', color: '#FF3B5C', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >삭제</button>
              <button
                type="button" onClick={() => leave(true)}
                style={{ flex: 1, height: 42, border: 'none', borderRadius: 999, background: 'var(--k-bg-191722)', color: 'var(--k-onink-fff)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >유지</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
