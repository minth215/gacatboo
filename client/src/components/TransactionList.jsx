import { useRef, useState } from 'react';
import { fmtWon } from '../lib/format.js';

const OPEN = 72; // 스와이프 시 드러나는 삭제 영역 폭(px)

// 왼쪽으로 스와이프하면 동그란 삭제 버튼이 나오는 행
function SwipeRow({ children, deletable, onDelete, onTap }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef(null);       // { x, y, base }
  const moved = useRef(false);
  const openRef = useRef(false);

  const down = (e) => {
    if (!deletable) return;
    st.current = { x: e.clientX, y: e.clientY, base: openRef.current ? -OPEN : 0 };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!st.current) return;
    const mx = e.clientX - st.current.x;
    const my = e.clientY - st.current.y;
    if (!moved.current) {
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 6) { st.current = null; return; } // 세로 스크롤
      if (Math.abs(mx) < 6) return;
      moved.current = true; setDragging(true);
    }
    let nx = st.current.base + mx;
    nx = Math.max(-OPEN - 16, Math.min(0, nx));
    setDx(nx);
  };
  const up = () => {
    if (!st.current) return;
    st.current = null;
    setDragging(false);
    const open = dx < -OPEN / 2;
    openRef.current = open;
    setDx(open ? -OPEN : 0);
  };
  const tap = () => {
    if (moved.current) return;               // 드래그였으면 무시
    if (openRef.current) { openRef.current = false; setDx(0); return; } // 열려있으면 닫기
    onTap?.();
  };

  if (!deletable) {
    return <div className="swipe-wrap">{children}</div>;
  }
  return (
    <div className="swipe-wrap">
      <div className="swipe-del">
        <button onClick={onDelete} aria-label="삭제">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
      <div
        className="swipe-fg"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.2s' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={tap}
      >
        {children}
      </div>
    </div>
  );
}

export default function TransactionList({ transactions, onEdit, onDelete, canEdit }) {
  if (!transactions.length) {
    return <div className="empty">항목이 없습니다.<br />＋ 버튼으로 첫 항목을 추가해 보세요.</div>;
  }

  const groups = {};
  for (const t of transactions) {
    (groups[t.date] ||= []).push(t);
  }
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div>
      {dates.map((date) => (
        <div key={date}>
          <div className="tx-group-date">{formatDate(date)}</div>
          {groups[date].map((t) => {
            const editable = canEdit ? canEdit(t) : true;
            const linked = !!t.origin_type;
            return (
              <SwipeRow key={t.id} deletable={editable && !!onDelete} onDelete={() => onDelete(t)} onTap={() => editable && onEdit(t)}>
                <div className="tx" style={{ cursor: editable ? 'pointer' : 'default' }}>
                  {t.category_emoji
                    ? <span className="cat-emoji">{t.category_emoji}</span>
                    : <span className="dot" style={{ background: t.type === 'income' ? 'var(--income)' : 'var(--expense)' }} />}
                  <div className="tx-main">
                    <div className="tx-title">
                      {t.content || t.category_name || (t.type === 'income' ? '수입' : '지출')}
                      {t.group_name && <span className="tag-group">{t.group_name}</span>}
                      {linked && <span className="tag-group" style={{ background: '#eef0ff', color: 'var(--primary)' }}>🔁 구독</span>}
                    </div>
                    <div className="tx-sub">
                      {[t.category_name, t.source_name, t.author_name && t.group_name ? `by ${t.author_name}` : null]
                        .filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className={`tx-amt ${t.type}`}>
                    {t.type === 'income' ? '+' : '-'}{fmtWon(t.amount)}
                  </div>
                </div>
              </SwipeRow>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatDate(d) {
  const dt = new Date(d + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${days[dt.getDay()]})`;
}
