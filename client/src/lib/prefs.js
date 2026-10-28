// 설정 > 가계부 커스터마이즈: 각 탭의 기본 상태. 화면 설정이라 style.js 처럼 localStorage 에만
// 보관하되, 한 기기에서 여러 계정을 쓸 수 있으므로 계정(user id)별로 따로 저장한다.
const KEY = (uid) => `gacatboo.prefs.v1.${uid || 'anon'}`;

export const PREF_DEFAULTS = {
  ledgerView: 'list',        // 가계부 기본 뷰: list | calendar
  quickMenu: 'favorites',    // "+" 왼쪽 버튼: none | favorites | receipt
  recordFocus: 'content',    // 기록 페이지 진입 시 포커스: content | amount
  ledgerSettle: true,        // 가계부 요약(수입/지출/합계) 정산 반영
  groupShowEnded: false,     // 그룹 목록에 종료된 그룹 보기
  statsView: 'donut',        // 통계 기본 뷰: donut | table
  statsSettle: true,         // 분류별 통계 정산 반영
  statsBudget: true,         // 분류별 통계 예산 바 보기
};

export function loadPrefs(uid) {
  try { return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY(uid)) || '{}') }; }
  catch { return { ...PREF_DEFAULTS }; }
}

export function savePrefs(uid, patch) {
  const next = { ...loadPrefs(uid), ...patch };
  try { localStorage.setItem(KEY(uid), JSON.stringify(next)); } catch {}
  return next;
}
