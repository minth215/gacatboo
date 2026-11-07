import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// 목록에서 카드를 눌러 다른 화면으로 갔다가 "<"·"X"·저장 등으로 되돌아오면(브라우저 뒤로 가기 = POP)
// 원래 보던 스크롤 위치로 돌려놓는다. 위치는 방문 기록 항목(location.key)마다 따로 기억한다.
// 새 화면으로 이동(PUSH)하면 맨 위에서 시작. 같은 화면 안의 탭 전환 등(REPLACE)은 그대로 둔다.
const positions = new Map();

export default function useScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);

  useEffect(() => {
    try { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; } catch {}
    const onScroll = () => { positions.set(keyRef.current, window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    keyRef.current = location.key;
    if (navType === 'PUSH') { window.scrollTo(0, 0); return undefined; }
    if (navType !== 'POP') return undefined;
    const y = positions.get(location.key) || 0;
    if (y <= 0) { window.scrollTo(0, 0); return undefined; }

    // 목록 데이터가 비동기로 늦게 그려지므로, 화면이 그 위치까지 길어질 때까지 잠시(최대 3초) 다시 시도.
    // 그사이 사용자가 직접 스크롤하면 멈춤.
    let stopped = false;
    let timer = 0;
    const stop = () => { stopped = true; clearTimeout(timer); };
    const started = Date.now();
    const attempt = () => {
      if (stopped) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(y, Math.max(max, 0)));
      if (max >= y - 1 && Math.abs(window.scrollY - y) <= 1) { stop(); return; }
      if (Date.now() - started > 3000) { stop(); return; }
      timer = setTimeout(attempt, 50);
    };
    attempt();
    const opts = { passive: true, once: true };
    window.addEventListener('touchstart', stop, opts);
    window.addEventListener('wheel', stop, opts);
    window.addEventListener('keydown', stop, opts);
    return () => {
      stop();
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [location.key, navType]);
}
