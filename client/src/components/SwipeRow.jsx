import { useEffect, useRef, useState } from 'react';

const DEFAULT_OPEN = 72; // 스와이프 시 드러나는 영역 기본 폭(px)

// ?debug=swipe 를 붙이면 화면 상단에 터치 이벤트 로그 패널을 띄운다(진단용, 평소엔 비표시).
const SWIPE_DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'swipe';
function debugLog(line) {
  if (!SWIPE_DEBUG) return;
  let panel = document.getElementById('__swipe_debug_panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = '__swipe_debug_panel';
    panel.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:rgba(0,0,0,0.85);color:#0f0;font:10px/1.4 monospace;padding:6px;max-height:40vh;overflow:auto;white-space:pre-wrap;pointer-events:none;';
    document.body.appendChild(panel);
  }
  const time = new Date().toISOString().slice(11, 23);
  panel.textContent = `[${time}] ${line}\n` + panel.textContent.split('\n').slice(0, 25).join('\n');
}
function describeTarget(el) {
  if (!el) return 'null';
  const cls = (el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.');
  return `${el.tagName}${cls ? '.' + cls : ''}`;
}
// 문서 전체에 캡처 단계 touchstart/pointerdown 리스너를 하나 걸어 둔다. 원래는 진단용으로
// 추가한 것인데, 이 리스너가 있을 때만(=?debug=swipe 로 열었을 때만) 오래된 카드의 스와이프가
// 안정적으로 먹히는 현상이 실제로 관찰되어 — 정확한 원인은 아직 모르지만(아마도 캡처 단계에
// 리스너가 하나라도 있으면 iOS Safari 가 네이티브 스크롤/제스처 판정을 더 일찍 확정하는 듯) —
// 평소에도(디버그 모드가 아니어도) 항상 걸어 둔다. 로그 패널만 ?debug=swipe 일 때 표시된다.
if (typeof document !== 'undefined' && !window.__swipeGlobalTouchBound) {
  window.__swipeGlobalTouchBound = true;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const real = t ? document.elementFromPoint(t.clientX, t.clientY) : null;
    debugLog(`[global] touchstart target=${describeTarget(e.target)} elementFromPoint=${describeTarget(real)}`);
  }, { capture: true, passive: true });
  document.addEventListener('pointerdown', (e) => {
    debugLog(`[global] pointerdown target=${describeTarget(e.target)} type=${e.pointerType}`);
  }, { capture: true });
}

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
    const real = document.elementFromPoint(e.clientX, e.clientY);
    debugLog(`DOWN target=${describeTarget(e.target)} elementFromPoint=${describeTarget(real)} ta=${real ? getComputedStyle(real).touchAction : '?'} pointerType=${e.pointerType}`);
    if (fullSwipe && wrapRef.current) openDistRef.current = wrapRef.current.getBoundingClientRect().width;
    st.current = { x: e.clientX, y: e.clientY, base: openRef.current ? -openDistRef.current : 0 };
    moved.current = false;
  };
  const move = (e) => {
    if (!st.current) return;
    const mx = e.clientX - st.current.x;
    const my = e.clientY - st.current.y;
    if (!moved.current) {
      const absX = Math.abs(mx), absY = Math.abs(my);
      // 손가락이 닿는 순간의 미세한 흔들림(실제 터치는 마우스보다 훨씬 들쭉날쭉함)을
      // 섣불리 세로 스크롤로 오판하지 않도록, 둘 다 충분히 움직이기 전까지는 더 지켜본다.
      if (absX < 10 && absY < 10) return;
      // 세로 쪽이 가로의 1.3배 넘게 더 커야 스크롤로 보고 포기한다. 살짝만 비스듬해도
      // 바로 포기하던 예전 기준이 실제 터치에서 스와이프가 들쭉날쭉 먹히던 원인이었다.
      if (absY > absX * 1.3) {
        debugLog(`ABORT(scroll) absX=${absX.toFixed(0)} absY=${absY.toFixed(0)}`);
        st.current = null; return;
      }
      if (absX < 10) return;
      moved.current = true; setDragging(true);
      debugLog(`COMMIT(horizontal) absX=${absX.toFixed(0)} absY=${absY.toFixed(0)}`);
      // 실제로 가로로 밀기 시작했을 때만 포인터를 잡는다. pointerdown 에서 바로 잡으면
      // 클릭이 카드 전체로 넘어가 카드 안의 버튼(연필 등)이 마우스 클릭에 반응하지 않는다.
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (err) { debugLog(`setPointerCapture ERROR ${err}`); }
    }
    // 가로 드래그로 확정된 뒤에는 매 move 마다 기본 동작을 명시적으로 막아야 한다. 안 그러면
    // (특히 iOS Safari에서) 브라우저가 뒤늦게 이 제스처를 스크롤/바운스로 가로채 버려서
    // pointermove 가 더 이상 오지 않고 스와이프가 끊기는 경우가 간헐적으로 있었다.
    try { e.preventDefault?.(); } catch (err) { debugLog(`preventDefault ERROR ${err}`); }
    let nx = st.current.base + mx;
    const max = openDistRef.current;
    nx = Math.max(-max - 16, Math.min(0, nx));
    setDx(nx);
  };
  const up = () => {
    debugLog(`UP moved=${moved.current} dx=${dx}`);
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
