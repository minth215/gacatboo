import { useEffect, useRef, useState } from 'react';

const DEFAULT_OPEN = 72; // 스와이프 시 드러나는 영역 기본 폭(px)

// 왼쪽으로 스와이프하면 액션 영역이 드러나는 행.
// actions 를 주면 기본 삭제 버튼 대신 그 내용을 보여준다(폭은 actionsWidth).
// actions 가 함수면 스와이프 진행도(0~1)를 받아 렌더링한다(카드가 밀리는 만큼 액션이 나타나는 효과용).
// fullSwipe 를 주면 카드가 actionsWidth 만큼만 밀리는 게 아니라 행 전체 폭만큼 밀려 왼쪽 화면 밖으로
// 완전히 사라지고, 버튼은 오른쪽 끝(actionsWidth 폭)에 고정된 채 그대로 드러난다.
// isOpen/onOpenChange 를 주면(선택) 목록 쪽에서 "한 번에 하나만 열림"을 제어할 수 있다.
// 이 행이 스스로 열리면 onOpenChange(true) 로 알리고, 부모가 isOpen 을 false 로 바꾸면
// (다른 행이 열려서) 자동으로 닫힌다.
export default function SwipeRow({ children, deletable, onDelete, onTap, actions, actionsWidth = DEFAULT_OPEN, fullSwipe = false, isOpen, onOpenChange }) {
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

  // 컨트롤드 모드: 부모가 isOpen=false 로 바꾸면(다른 행이 열렸을 때) 이 행은 자동으로 닫힘
  useEffect(() => {
    if (isOpen === undefined) return;
    if (!isOpen && openRef.current) {
      openRef.current = false;
      setDx(0);
    }
  }, [isOpen]);

  const setOpen = (open) => {
    openRef.current = open;
    setDx(open ? -openDistRef.current : 0);
    onOpenChange?.(open);
  };

  const down = (e) => {
    if (!swipeEnabled) return;
    if (fullSwipe && wrapRef.current) openDistRef.current = wrapRef.current.getBoundingClientRect().width;
    st.current = { x: e.clientX, y: e.clientY, base: openRef.current ? -openDistRef.current : 0 };
    moved.current = false;
  };
  const move = (e) => {
    if (!st.current) return;
    const mx = e.clientX - st.current.x;
    const my = e.clientY - st.current.y;
    if (!moved.current) {
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 6) { st.current = null; return; }
      if (Math.abs(mx) < 6) return;
      moved.current = true; setDragging(true);
      // 실제로 가로로 밀기 시작했을 때만 포인터를 잡는다. pointerdown 에서 바로 잡으면
      // 클릭이 카드 전체로 넘어가 카드 안의 버튼(연필 등)이 마우스 클릭에 반응하지 않는다.
      e.currentTarget.setPointerCapture?.(e.pointerId);
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
    setOpen(-dx > revealWidth / 2);
  };
  const tap = () => {
    if (moved.current) return;
    if (openRef.current) { setOpen(false); return; }
    onTap?.();
  };

  // 밀어서 여는 동작(삭제 등)이 없어도 탭(onTap)은 그대로 동작해야 한다.
  if (!swipeEnabled) {
    return (
      <div className="swipe-wrap">
        <div className="swipe-fg" onClick={onTap} style={onTap ? { cursor: 'pointer' } : undefined}>{children}</div>
      </div>
    );
  }

  return (
    <div className="swipe-wrap" ref={wrapRef}>
      <div className="swipe-del" style={actions ? { width: actionsWidth } : undefined}>
        {typeof actions === 'function' ? actions(progress) : actions || (
          <button onClick={onDelete} aria-label="삭제" style={{ opacity: progress }}>
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
        // 밀려 있지 않을 때는 transform 을 아예 두지 않는다. iOS Safari 에서 transform 이 걸린
        // 요소는 합성 레이어가 되어, 안의 글자(금액)가 바뀌어도 화면이 다시 그려지지 않는 경우가 있다.
        style={{ transform: dx ? `translateX(${dx}px)` : 'none', transition: dragging ? 'none' : 'transform 0.2s', willChange: dragging ? 'transform' : 'auto' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={tap}
      >
        {children}
      </div>
    </div>
  );
}
