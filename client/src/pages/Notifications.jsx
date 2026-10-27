import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
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
      if (!r.read_at) {
        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x)));
        db.markNotificationRead(r.id).catch(() => {});
      }
    } catch (e) { alert(e.message); }
    finally { setInviteBusy(null); }
  };

  const openRow = async (r) => {
    if (r.event_key === 'group_invite') {
      // 수락 전/거절 상태는 눌러도 이동 없음(버튼으로만 응답). 수락한 상태면 그 그룹으로,
      // 그 뒤 그룹에서 나왔거나 그룹이 삭제됐으면 안내 토스트.
      const st = r.data?.member_id ? inviteStatus[r.data.member_id] : null;
      if (st?.status === 'gone') { showToast('지금 참여 중인 그룹이 아닙니다'); return; }
      if (!(st?.status === 'active' && st?.linked_to_me)) return;
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
        rows.map((r, i) => (
          // 가계부 카드와 같은 스와이프: 카드 자체가 밀리고 그 자리엔 페이지 배경 위 삭제 버튼만 보임
          <div key={r.id} className="tx-daygroup" style={{ marginTop: i === 0 ? 14 : 10 }}>
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
                    <div style={{ marginTop: 2, fontSize: 12, color: 'var(--k-tx-6c6779)', lineHeight: 1.4 }}>{r.body}</div>
                  </div>
                </div>
                {r.event_key === 'group_invite' && r.data?.member_id && (() => {
                  const st = inviteStatus[r.data.member_id];
                  if (st?.status === 'gone') return null;
                  if (!st || st.status === 'pending') {
                    const busy = inviteBusy === r.data.member_id;
                    return (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, marginLeft: 48 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-ink-pill" style={{ height: 34, flex: 1, fontSize: 12.5 }} disabled={busy} onClick={() => respondInvite(r, true)}>수락</button>
                        <button type="button" className="btn-ink-pill" style={{ height: 34, flex: 1, fontSize: 12.5, background: 'var(--k-bg-f4f2f0)', color: 'var(--k-tx-6c6779)' }} disabled={busy} onClick={() => respondInvite(r, false)}>거절</button>
                      </div>
                    );
                  }
                  return (
                    <div style={{ marginTop: 6, marginLeft: 48, fontSize: 11, fontWeight: 700, color: st.linked_to_me ? 'var(--income)' : 'var(--k-tx-a29ead)' }}>
                      {st.linked_to_me ? '수락했어요' : '거절했어요'}
                    </div>
                  );
                })()}
              </div>
            </DayCardRow>
          </div>
        ))
      )}
      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}
    </div>
  );
}
