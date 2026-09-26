import { useRef, useState } from 'react';

// 핸들을 잡고 위아래로 끌어 목록 순서를 바꾸는 훅(마우스·터치 공통, Pointer Events 사용).
// items: 현재 목록(각 항목에 id 필요), setItems: 로컬 상태 갱신, persist: 최종 순서(id 배열) 저장.
export function useDragReorder(items, setItems, persist) {
  const [dragId, setDragId] = useState(null);
  const rowRefs = useRef(new Map());
  const orderRef = useRef(items);
  orderRef.current = items;

  const setRowRef = (id) => (el) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  const startDrag = (id) => (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDragId(id);

    const onMove = (ev) => {
      const y = ev.clientY;
      const list = orderRef.current;
      const idx = list.findIndex((x) => x.id === id);
      for (let i = 0; i < list.length; i++) {
        if (i === idx) continue;
        const r = rowRefs.current.get(list[i].id)?.getBoundingClientRect();
        if (r && y > r.top && y < r.bottom) {
          const arr = [...list];
          const [moved] = arr.splice(idx, 1);
          arr.splice(i, 0, moved);
          setItems(arr);
          break;
        }
      }
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      setDragId(null);
      persist(orderRef.current.map((x) => x.id));
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  return { dragId, setRowRef, startDrag };
}
