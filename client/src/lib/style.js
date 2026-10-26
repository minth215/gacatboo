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

// 테마: 'light' | 'dark' | 'system'(기기 설정 따름). 다크면 <html class="theme-dark"> 로
// 색상 토큰(index.css)이 먹색 계열로 바뀐다. color-scheme 메타도 같이 바꿔서
// 라이트일 땐 브라우저 자동 다크 변환을 막고, 다크일 땐 기본 컨트롤도 어둡게.
const darkMq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current = DEFAULTS;

export function resolveDark(theme) {
  return theme === 'dark' || (theme === 'system' && !!darkMq?.matches);
}

function applyTheme(theme) {
  const dark = resolveDark(theme);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark' : 'only light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#18161D' : '#FF3B5C');
}

// body/html 클래스에 반영
export function applyStyle(style) {
  current = style;
  document.body.classList.toggle('font-system', style.font === 'system');
  applyTheme(style.theme);
}

// "기기 설정 따름"일 때 기기 테마가 바뀌면 바로 따라감
darkMq?.addEventListener?.('change', () => { if (current.theme === 'system') applyTheme('system'); });

export function setStyle(patch) {
  const next = { ...loadStyle(), ...patch };
  saveStyle(next);
  applyStyle(next);
  return next;
}
