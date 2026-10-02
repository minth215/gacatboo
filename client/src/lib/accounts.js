// 이 기기에서 로그인했던 계정들을 로컬에 기억해 두고, 비밀번호 재입력 없이
// 빠르게 전환할 수 있게 해주는 헬퍼. 비밀번호는 절대 저장하지 않고, Supabase
// 세션 토큰(현재 접속에 쓰이는 것과 동일한 종류)만 보관한다.
const KEY = 'gacatboo.accounts.v1';

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function saveAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
}

// 최근 전환/로그인 순으로 정렬된 저장 계정 목록
export function listSavedAccounts() {
  return Object.values(loadAll()).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

export function getSavedAccount(id) {
  return loadAll()[id] || null;
}

// 로그인/세션 갱신 시점마다 호출해 해당 계정의 최신 토큰을 저장(토큰은 재사용 시 갱신되므로 매번 최신화 필요)
export function rememberAccount(profile, session) {
  if (!profile?.id || !session?.access_token || !session?.refresh_token) return;
  const all = loadAll();
  all[profile.id] = {
    id: profile.id, username: profile.username, display_name: profile.display_name,
    access_token: session.access_token, refresh_token: session.refresh_token,
    updated_at: Date.now(),
  };
  saveAll(all);
}

export function forgetAccount(id) {
  const all = loadAll();
  delete all[id];
  saveAll(all);
}
