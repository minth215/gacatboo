import { useRef, useState } from 'react';

const OPEN = 72; // 스와이프 시 드러나는 삭제 영역 폭(px)

// 왼쪽으로 스와이프하면 흰 배경 + 빨간 휴지통 삭제 버튼이 나오는 행
export default function SwipeRow({ children, deletable, onDelete, onTap }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef(null);
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
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 6) { st.current = null; return; }
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
    if (moved.current) return;
    if (openRef.current) { openRef.current = false; setDx(0); return; }
    onTap?.();
  };

  if (!deletable) return <div className="swipe-wrap">{children}</div>;

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
