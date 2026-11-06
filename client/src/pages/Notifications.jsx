import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { primarySettleSource } from '../lib/sourceFilter.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { DayCardRow } from '../components/TransactionList.jsx';

// 상대 시간 표기(방금/N 분 전/N 시간 전/N 일 전 — 의존 명사 띄어쓰기), 오래된 건 날짜로.
function timeAgo(iso) {
  const d = new Date(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 일 전`;
  return d.toISOString().slice(0, 10).replace(/-/g, '.');
}

export default function Notifications() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록
  // 그룹 초대 알림의 현재 상태(memberId -> {status, linked_to_me}). 받은 사람은 수락 전까지
  // group_members 를 직접 조회할 수 없어 전용 RPC로 받아온다.
  const [inviteStatus, setInviteStatus] = useState({});
  const [inviteBusy, setInviteBusy] = useState(null);
  // 수락 모달: 그룹 내 닉네임(총무/총대가 정한 이름이 기본)과 출금 수단(주결제수단이 기본)
  const [acceptFor, setAcceptFor] = useState(null); // { r, memberId, groupName, nickname, sourceId }
  const [sourceTree, setSourceTree] = useState([]);
  const openAccept = async (r) => {
    const memberId = r.data?.member_id;
    if (!memberId || inviteBusy) return;
    try {
      const [info, { tree, flat }] = await Promise.all([db.getGroupInviteInfo(memberId), db.listSources()]);
      setSourceTree(tree);
      // 출금 수단 기본값: 주 정산 수단 → 없으면 주 결제 수단
      const primary = primarySettleSource(flat) || flat.find((x) => x.parent_id != null && x.is_primary_payment);
      setAcceptFor({ r, memberId, groupName: info?.group_name || '', nickname: info?.nickname || '', sourceId: primary ? String(primary.id) : '' });
    } catch (e) { alert(e.message); }
  };
  const submitAccept = async () => {
    const { r, memberId, nickname, sourceId } = acceptFor;
    if (!nickname.trim()) return alert('닉네임을 입력하세요.');
    if (!sourceId) return alert('출금 수단을 선택하세요.');
    setInviteBusy(memberId);
    try {
      await db.acceptGroupInvite(memberId, nickname.trim(), sourceId);
      setInviteStatus((prev) => ({ ...prev, [memberId]: { status: 'active', linked_to_me: true } }));
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, invite_response: 'accepted', read_at: x.read_at || new Date().toISOString() } : x)));
      db.setInviteResponse(r.id, 'accepted').catch(() => {});
      setAcceptFor(null);
    } catch (e) { alert(e.message); }
    finally { setInviteBusy(null); }
  };
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    setToastKey((k) => k + 1);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  const load = useCallback(() => {
    setLoading(true);
    db.listNotifications().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ids = [...new Set(rows.filter((r) => r.event_key === 'group_invite' && r.data?.member_id).map((r) => r.data.member_id))];
    if (!ids.length) return;
    // 멤버 행이 없으면(그룹에서 나왔거나 그룹이 삭제됨) 'gone'. 조회 실패는 상태를 비워 둔다.
    Promise.all(ids.map((id) => db.getGroupInviteStatus(id).then((s) => [id, s || { status: 'gone', linked_to_me: false }]).catch(() => [id, null])))
      .then((pairs) => setInviteStatus((prev) => {
        const next = { ...prev };
        pairs.forEach(([id, s]) => { if (s) next[id] = s; });
        return next;
      }));
  }, [rows]);

  // 멤버(초대) id 별로 아직 응답하지 않은 가장 최근 초대장 카드 id(목록은 최신순)
  const latestInviteId = {};
  rows.forEach((r) => {
    if (r.event_key !== 'group_invite' || !r.data?.member_id || r.invite_response) return;
    if (!(r.data.member_id in latestInviteId)) latestInviteId[r.data.member_id] = r.id;
  });
  const hasUnread = rows.some((r) => !r.read_at);
  // 하단 바 알림 점(Layout)에 안 읽은 개수를 바로 알림
  useEffect(() => {
    if (loading) return;
    window.dispatchEvent(new CustomEvent('gacatboo:unread', { detail: rows.filter((r) => !r.read_at).length }));
  }, [rows, loading]);

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setRows((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: now })));
    try { await db.markAllNotificationsRead(); } catch (e) { alert(e.message); load(); }
  };

  const respondInvite = async (r, accept) => {
    const memberId = r.data?.member_id;
    if (!memberId || inviteBusy) return;
    setInviteBusy(memberId);
    try {
      await db.respondToGroupInvite(memberId, accept);
      setInviteStatus((prev) => ({ ...prev, [memberId]: { status: 'active', linked_to_me: accept } }));
      const resp = accept ? 'accepted' : 'declined';
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, invite_response: resp, read_at: x.read_at || new Date().toISOString() } : x)));
      db.setInviteResponse(r.id, resp).catch(() => {});
    } catch (e) { alert(e.message); }
    finally { setInviteBusy(null); }
  };

  const openRow = async (r) => {
    if (r.event_key === 'group_invite') {
      // 수락 전/거절 상태는 눌러도 이동 없음(버튼으로만 응답). 수락한 상태면 그 그룹으로,
      // 그 뒤 그룹에서 나왔거나 그룹이 삭제됐으면 안내 토스트.
      // 카드별 응답(0100): 수락했던 카드는 지금 그 그룹 멤버면 이동, 탈퇴했거나 재초대 수락 전이면 토스트
      const st = r.data?.member_id ? inviteStatus[r.data.member_id] : null;
      if (r.invite_response === 'accepted') {
        if (!(st?.status === 'active' && st?.linked_to_me)) { showToast('지금 참여 중인 그룹이 아닙니다'); return; }
      } else {
        if (st?.status === 'gone') { showToast('지금 참여 중인 그룹이 아닙니다'); return; }
        if (r.invite_response || !(st?.status === 'active' && st?.linked_to_me)) return;
      }
    }
    if (!r.read_at) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x)));
      db.markNotificationRead(r.id).catch(() => {});
    }
    if (r.link) nav(r.link);
  };

  const removeRow = async (r) => {
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    try { await db.deleteNotification(r.id); } catch { load(); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="알림" showBack={false} right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasUnread && <button type="button" className="edit-link" onClick={markAllRead}>모두 읽음</button>}
          <button type="button" className="tb-icon-btn" style={{ color: 'var(--k-tx-6c6779)' }} onClick={() => nav('/settings/notifications')} aria-label="알림 설정">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      } />

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="empty empty-center">알림이 없습니다.</div>
      ) : (
        rows.map((r, i) => {
          const invite = r.event_key === 'group_invite' && r.data?.member_id ? inviteStatus[r.data.member_id] : null;
          // 응답 문구: 이 카드에 한 응답(0100). 응답 기록이 없는 예전 카드는 최신 초대장일 때만 현재 상태로 추정
          const isLatestInvite = r.event_key === 'group_invite' && latestInviteId[r.data?.member_id] === r.id;
          const responseLabel = r.invite_response === 'accepted' ? '수락했어요' : r.invite_response === 'declined' ? '거절했어요'
            : (isLatestInvite && invite?.status === 'active') ? (invite.linked_to_me ? '수락했어요' : '거절했어요') : null;
          return (
          // 가계부 카드와 같은 스와이프: 카드 자체가 밀리고 그 자리엔 페이지 배경 위 삭제 버튼만 보임
          <div key={r.id} className="tx-daygroup" style={{ marginTop: i === 0 ? 0 : 10 }}>
            <DayCardRow
              index={0} count={1} clickable
              isOpen={openId === r.id} onOpenChange={(open) => setOpenId(open ? r.id : null)}
              onTap={() => openRow(r)} onDelete={() => removeRow(r)}
              background={r.read_at ? 'var(--k-bg-fff)' : 'var(--k-unread-bg)'}
            >
              {/* 제목/내용은 이모지와 세로 가운데 정렬(모든 카드 동일). 초대 카드는 그 아래에 수락/거절 버튼·상태 줄이
                  붙어 카드 높이만 늘어남 */}
              <div style={{ flex: 1, minWidth: 0, margin: '1px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 38, height: 38, borderRadius: 12, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, background: r.color || '#FFE9EF',
                  }}>
                    {r.emoji || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: r.read_at ? 600 : 800, color: 'var(--k-tx-191722)' }}>{r.title}</span>
                        {!r.read_at && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF3B5C', flex: 'none' }} />}
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--k-tx-a29ead)', flex: 'none', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</span>
                    </div>
                    {/* 내용 줄. 초대에 응답했으면 같은 줄 오른쪽 끝에 "수락했어요/거절했어요" */}
                    <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ minWidth: 0, fontSize: 12, color: 'var(--k-tx-6c6779)', lineHeight: 1.4 }}>{r.body}</span>
                      {responseLabel && (
                        <span style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: responseLabel === '수락했어요' ? 'var(--income)' : 'var(--k-tx-a29ead)' }}>
                          {responseLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {r.event_key === 'group_invite' && r.data?.member_id && (() => {
                  const st = inviteStatus[r.data.member_id];
                  if (st?.status === 'gone' || r.invite_response) return null;
                  // 수락/거절 버튼은 아직 응답하지 않은 가장 최근 초대장 카드에만
                  if (isLatestInvite && (!st || st.status === 'pending')) {
                    const busy = inviteBusy === r.data.member_id;
                    return (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-ink-pill" style={{ height: 30, width: 72, flex: 'none', marginTop: 0, fontSize: 12 }} disabled={busy} onClick={() => openAccept(r)}>수락</button>
                        <button type="button" className="btn-ink-pill" style={{ height: 30, width: 72, flex: 'none', marginTop: 0, fontSize: 12, background: 'var(--k-bg-f4f2f0)', color: 'var(--k-tx-6c6779)' }} disabled={busy} onClick={() => respondInvite(r, false)}>거절</button>
                      </div>
                    );
                  }
                  return null; // 응답한 상태 문구는 내용 줄 오른쪽 끝에 표시
                })()}
              </div>
            </DayCardRow>
          </div>
          );
        })
      )}
      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
      {acceptFor && (
        <div className="catmodal-overlay" onClick={() => setAcceptFor(null)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--k-tx-191722)' }}>{acceptFor.groupName || '그룹'} 입장</div>
              <button aria-label="닫기" onClick={() => setAcceptFor(null)} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>닉네임</span>
              <input
                type="text" value={acceptFor.nickname} placeholder="그룹 내에서 보일 닉네임"
                onChange={(e) => setAcceptFor((a) => ({ ...a, nickname: e.target.value }))}
                style={{ fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>출금 수단 <span style={{ color: '#FF3B5C' }}>*</span></span>
              {/* 입금 내역에서 내 쪽 원천으로 들어갈 수단(원천 그룹 아래 세부 항목) */}
              <select
                value={acceptFor.sourceId} onChange={(e) => setAcceptFor((a) => ({ ...a, sourceId: e.target.value }))}
                style={{ ...{ fontFamily: 'inherit', fontSize: 13.75, color: 'var(--k-tx-191722)', background: 'var(--k-bg-faf9f8)', border: '1.5px solid var(--k-bd-efeef2)', borderRadius: 14, padding: '14px 16px', outline: 'none', width: '100%', boxSizing: 'border-box' }, color: acceptFor.sourceId ? 'var(--k-tx-191722)' : 'var(--k-tx-a29ead)' }}
              >
                <option value="">출금 수단 선택</option>
                {sourceTree.filter((t) => t.children?.length).map((t) => (
                  <optgroup key={t.id} label={t.name}>
                    {t.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44, fontSize: 14 }} disabled={inviteBusy === acceptFor.memberId || !acceptFor.nickname.trim() || !acceptFor.sourceId} onClick={submitAccept}>
              {inviteBusy === acceptFor.memberId ? '입장 중…' : '입장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
