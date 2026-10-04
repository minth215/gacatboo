import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import SwipeRow from '../components/SwipeRow.jsx';

// 상대 시간 표기(방금/N분 전/N시간 전/N일 전), 오래된 건 날짜로.
function timeAgo(iso) {
  const d = new Date(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  return d.toISOString().slice(0, 10).replace(/-/g, '.');
}

export default function Notifications() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 스와이프로 열려 있도록

  const load = useCallback(() => {
    setLoading(true);
    db.listNotifications().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const hasUnread = rows.some((r) => !r.read_at);

  const markAllRead = async () => {
    try { await db.markAllNotificationsRead(); load(); } catch (e) { alert(e.message); }
  };

  const openRow = async (r) => {
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
      <PageHeader title="알림" showBack={false} right={hasUnread && (
        <button type="button" className="edit-link" onClick={markAllRead}>모두 읽음</button>
      )} />

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="empty empty-center">알림이 없습니다.</div>
      ) : (
        <div className="tx-daycard" style={{ marginTop: 14 }}>
          {rows.map((r, i) => (
            <SwipeRow
              key={r.id} isOpen={openId === r.id} onOpenChange={(open) => setOpenId(open ? r.id : null)}
              onTap={() => openRow(r)} deletable onDelete={() => removeRow(r)}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 16px', cursor: 'pointer',
                  borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5', background: r.read_at ? 'transparent' : '#fff8f3',
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: 12, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, background: r.color || '#FFE9EF', marginTop: 1,
                }}>
                  {r.emoji || '🔔'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: r.read_at ? 600 : 800, color: '#191722' }}>{r.title}</span>
                      {!r.read_at && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF3B5C', flex: 'none' }} />}
                    </div>
                    <span style={{ fontSize: 10.5, color: '#a29ead', flex: 'none', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: '#6c6779', lineHeight: 1.4 }}>{r.body}</div>
                </div>
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </div>
  );
}
