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
    setDragId(id);

    // 핸들 엘리먼트(el)가 아니라 window 에 리스너를 건다. 한 칸 옮길 때마다 React가 목록을
    // 재정렬하며 핸들을 DOM 안에서 이동시키는데, setPointerCapture 로 캡처해둔 상태로 그
    // 이동이 일어나면 브라우저가 캡처를 조용히 풀어버려 다음 pointermove부터는 이벤트가
    // 와야 할 el로 오지 않는다(핸들을 놓았다 다시 잡아야만 계속 움직이던 원인). window는
    // 목록 재정렬과 무관하게 항상 같은 자리에 있으므로 이 문제가 없다.
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDragId(null);
      persist(orderRef.current.map((x) => x.id));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return { dragId, setRowRef, startDrag };
}
