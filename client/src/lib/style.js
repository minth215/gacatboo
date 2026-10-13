// 설정 > 스타일(테마/폰트)을 이 기기에만 저장하는 헬퍼. 계정 데이터가 아닌 기기별
// 화면 설정이라 accounts.js 와 같은 방식으로 localStorage 에만 보관한다.
const KEY = 'gacatboo.style.v1';
const DEFAULTS = { theme: 'light', font: 'paperlogy' };

export function loadStyle() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

function saveStyle(style) {
  try { localStorage.setItem(KEY, JSON.stringify(style)); } catch {}
}

// body 클래스에 반영(다크 모드는 아직 미구현이라 테마는 라이트로만 적용됨).
export function applyStyle(style) {
  document.body.classList.toggle('font-system', style.font === 'system');
  document.body.classList.toggle('theme-dark', style.theme === 'dark');
}

export function setStyle(patch) {
  const next = { ...loadStyle(), ...patch };
  saveStyle(next);
  applyStyle(next);
  return next;
}
