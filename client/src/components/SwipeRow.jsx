import { useRef, useState } from 'react';

const DEFAULT_OPEN = 72; // 스와이프 시 드러나는 영역 기본 폭(px)

// 왼쪽으로 스와이프하면 액션 영역이 드러나는 행.
// actions 를 주면 기본 삭제 버튼 대신 그 내용을 보여준다(폭은 actionsWidth).
// actions 가 함수면 스와이프 진행도(0~1)를 받아 렌더링한다(카드가 밀리는 만큼 액션이 나타나는 효과용).
// fullSwipe 를 주면 카드가 actionsWidth 만큼만 밀리는 게 아니라 행 전체 폭만큼 밀려 왼쪽 화면 밖으로
// 완전히 사라지고, 버튼은 오른쪽 끝(actionsWidth 폭)에 고정된 채 그대로 드러난다.
export default function SwipeRow({ children, deletable, onDelete, onTap, actions, actionsWidth = DEFAULT_OPEN, fullSwipe = false }) {
  const revealWidth = actions ? actionsWidth : DEFAULT_OPEN;
  const swipeEnabled = deletable || !!actions;
  const wrapRef = useRef(null);
  const openDistRef = useRef(revealWidth);
  const [dx, setDx] = useState(0);
  const progress = Math.min(1, Math.max(0, -dx / revealWidth));
  const [dragging, setDragging] = useState(false);
  const st = useRef(null);
  const moved = useRef(false);
  const openRef = useRef(false);

  const down = (e) => {
    if (!swipeEnabled) return;
    if (fullSwipe && wrapRef.current) openDistRef.current = wrapRef.current.getBoundingClientRect().width;
    st.current = { x: e.clientX, y: e.clientY, base: openRef.current ? -openDistRef.current : 0 };
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
    const max = openDistRef.current;
    nx = Math.max(-max - 16, Math.min(0, nx));
    setDx(nx);
  };
  const up = () => {
    if (!st.current) return;
    st.current = null;
    setDragging(false);
    const open = -dx > revealWidth / 2;
    openRef.current = open;
    setDx(open ? -openDistRef.current : 0);
  };
  const tap = () => {
    if (moved.current) return;
    if (openRef.current) { openRef.current = false; setDx(0); return; }
    onTap?.();
  };

  if (!swipeEnabled) return <div className="swipe-wrap">{children}</div>;

  return (
    <div className="swipe-wrap" ref={wrapRef}>
      <div className="swipe-del" style={actions ? { width: actionsWidth } : undefined}>
        {typeof actions === 'function' ? actions(progress) : actions || (
          <button onClick={onDelete} aria-label="삭제">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        )}
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
