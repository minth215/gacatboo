import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isConfigured } from './supabase.js';
import { rememberAccount, forgetAccount, getSavedAccount } from './accounts.js';

const AuthContext = createContext(null);

async function fetchProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // 프로필 (id, username, display_name, role, status)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }

    // 최초 세션 복원
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (profile?.status === 'approved') { setUser(profile); rememberAccount(profile, session); }
        else { await supabase.auth.signOut(); setUser(null); }
      }
      setLoading(false);
    });

    // 세션 변화 구독 (탭 간 동기화/토큰 갱신)
    // 주의: onAuthStateChange 콜백 안에서 supabase 쿼리를 즉시 호출하면 교착될 수 있어 지연 실행.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return; // getSession 에서 이미 처리
      if (!session?.user) { setUser(null); return; }
      setTimeout(async () => {
        const profile = await fetchProfile(session.user.id);
        setUser(profile?.status === 'approved' ? profile : null);
        // 토큰이 갱신될 때마다(TOKEN_REFRESHED 등) 저장된 계정 전환용 토큰도 최신으로 유지
        if (profile?.status === 'approved') rememberAccount(profile, session);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 로그인 — 승인된 계정만 허용
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    const profile = await fetchProfile(data.user.id);
    if (!profile) { await supabase.auth.signOut(); throw new Error('프로필을 찾을 수 없습니다.'); }
    if (profile.status !== 'approved') {
      await supabase.auth.signOut();
      throw new Error(profile.status === 'pending'
        ? '아직 관리자 승인 대기 중인 계정입니다.'
        : '로그인이 거부된 계정입니다. 관리자에게 문의하세요.');
    }
    setUser(profile);
    rememberAccount(profile, data.session);
    return profile;
  };

  // 계정 전환 — 이 기기에서 전에 로그인했던 다른 계정으로 비밀번호 재입력 없이 전환.
  // (다른 사람의 계정으로는 전환할 수 없음 — 저장된 토큰은 본인이 직접 로그인했던 계정의 것뿐)
  const switchAccount = async (id) => {
    const saved = getSavedAccount(id);
    if (!saved) throw new Error('저장된 계정 정보를 찾을 수 없습니다. 다시 로그인해 주세요.');
    const { data, error } = await supabase.auth.setSession({
      access_token: saved.access_token, refresh_token: saved.refresh_token,
    });
    if (error || !data.session) {
      forgetAccount(id);
      throw new Error('세션이 만료되어 다시 로그인이 필요합니다.');
    }
    const profile = await fetchProfile(data.session.user.id);
    if (!profile || profile.status !== 'approved') {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('로그인할 수 없는 계정입니다.');
    }
    setUser(profile);
    rememberAccount(profile, data.session);
    return profile;
  };

  // 가입 신청 — 승인 전에는 로그인 불가(세션 종료). 최초 사용자는 트리거로 관리자·승인 처리됨.
  const register = async ({ email, password, username, display_name }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { username, display_name } },
    });
    if (error) throw new Error(error.message);

    // 이메일 확인이 꺼져 있으면 세션이 생김 → 승인 상태 확인
    if (data.session?.user) {
      const profile = await fetchProfile(data.session.user.id);
      if (profile?.status === 'approved') { setUser(profile); return { approved: true }; }
      await supabase.auth.signOut();
    }
    return { approved: false };
  };

  const logout = async () => {
    if (user) forgetAccount(user.id);
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, switchAccount, isConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
