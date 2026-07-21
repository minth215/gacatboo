import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isConfigured } from './supabase.js';

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
        if (profile?.status === 'approved') setUser(profile);
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
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, isConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
