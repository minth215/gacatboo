import { useEffect, useRef, useState } from 'react';

const W = 44; // 드러나는 버튼 영역 폭

// 기록 폼의 항목 행: 왼쪽으로 밀면 오른쪽 끝에 "회색 원 + 흰색 −" 버튼이 나오고, 누르면 onRemove.
// 평소엔 잘라내지 않아(overflow visible) 금액 키패드·추천 목록 같은 떠 있는 요소가 가려지지 않고,
// 밀고 있는/열린 동안에만 행을 잘라 버튼 자리를 만든다. enabled=false 면 스와이프 없음.
export default function SwipeRemove({ enabled = true, onRemove, children }) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef(null);
  const moved = useRef(false);
  const open = useRef(false);
  const wrapRef = useRef(null);

  const setOpen = (v) => { open.current = v; setDx(v ? -W : 0); };

  useEffect(() => { if (!enabled && open.current) setOpen(false); }, [enabled]);

  // 열린 상태에서 행 밖을 누르면 닫힘
  useEffect(() => {
    if (dx === 0 || drag) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [dx, drag]);

  const down = (e) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    st.current = { x: e.clientX, y: e.clientY, base: open.current ? -W : 0, id: e.pointerId };
    moved.current = false;
  };
  const move = (e) => {
    if (!st.current) return;
    const mx = e.clientX - st.current.x;
    const my = e.clientY - st.current.y;
    if (!moved.current) {
      const ax = Math.abs(mx), ay = Math.abs(my);
      if (ax < 10 && ay < 10) return;
      if (ay > ax * 1.3 || ax < 10) { st.current = null; return; }
      moved.current = true; setDrag(true);
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      if (document.activeElement && wrapRef.current?.contains(document.activeElement)) document.activeElement.blur();
    }
    setDx(Math.max(-W - 24, Math.min(0, st.current.base + mx)));
  };
  const up = () => {
    if (!st.current) return;
    st.current = null;
    if (moved.current) { setDrag(false); setOpen(dx < -W / 2); }
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onClickCapture={(e) => {
        // 밀기 동작 끝의 클릭은 무시, 열린 상태에서 행을 누르면(버튼 제외) 닫기만
        if (moved.current) { moved.current = false; e.preventDefault(); e.stopPropagation(); return; }
        if (open.current && !e.target.closest?.('[data-swipe-remove]')) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      }}
      style={{ position: 'relative', touchAction: 'pan-y', overflow: (dx !== 0 || drag) ? 'hidden' : 'visible' }}
    >
      <div style={{ transform: dx ? `translateX(${dx}px)` : 'none', transition: drag ? 'none' : 'transform .2s ease' }}>
        {children}
      </div>
      {(dx !== 0 || drag) && (
        <button
          type="button" data-swipe-remove aria-label="행 삭제"
          onClick={() => { setOpen(false); onRemove?.(); }}
          style={{
            position: 'absolute', right: (W - 24) / 2, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
            background: 'var(--k-tx-c2bfc6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: Math.min(1, -dx / W),
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      )}
    </div>
  );
}
