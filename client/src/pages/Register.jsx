import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import CatMascot from '../components/CatMascot.jsx';
import { passwordPolicyError } from '../lib/validators.js';

export default function Register() {
  const { register, isConfigured } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const pwErr = passwordPolicyError(form.password);
    if (pwErr) return setError(pwErr);
    setBusy(true);
    try {
      const res = await register({
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim(),
        display_name: form.display_name.trim(),
      });
      if (res.approved) {
        nav('/'); // 최초 관리자 등은 즉시 로그인
      } else {
        setDone('가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = (name) => ({
    fontFamily: 'inherit', fontSize: 15, color: '#191722', background: '#fff',
    border: `1.5px solid ${focus === name ? '#191722' : '#e9e9ee'}`, borderRadius: 999,
    padding: '15px 22px', outline: 'none', width: '100%',
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px', background: '#FEFCFC' }}>
      <div style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-1px', color: '#191722' }}>가캣부<span style={{ color: '#FF3B5C' }}>.</span></div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#8b8798' }}>관리자 승인 후 이용할 수 있어요</div>
        </div>

        {!isConfigured && (
          <div style={{ marginTop: 20, padding: '12px 15px', background: '#fff8f8', border: '1px solid #f3c7c8', borderRadius: 12, fontSize: 12.5, color: '#e5484d' }}>
            Supabase 연결이 설정되지 않았습니다. <code>client/.env</code> 에 <code>VITE_SUPABASE_URL</code> 과 <code>VITE_SUPABASE_ANON_KEY</code> 를 설정하세요.
          </div>
        )}

        <div style={{ marginTop: 48, position: 'relative' }}>
          <div style={{ position: 'absolute', top: -168, right: -81, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,59,92,.4) 0%,rgba(255,59,92,.18) 45%,rgba(255,59,92,0) 72%)', opacity: 0.5, pointerEvents: 'none' }} />
          <CatMascot width={80} style={{ position: 'absolute', top: -42.5, right: 22 }} />

          {done ? (
            <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#191722', lineHeight: 1.5 }}>{done}</p>
              <Link
                to="/login"
                style={{ width: '100%', fontFamily: 'inherit', height: 56, border: 'none', borderRadius: 999, background: '#191722', color: '#fff', fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
              >
                로그인 화면으로
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                placeholder="이메일" type="email" autoComplete="username"
                value={form.email} onChange={set('email')}
                onFocus={() => setFocus('email')} onBlur={() => setFocus('')} style={inputStyle('email')}
              />
              <input
                placeholder="아이디 (변경 가능)" type="text" autoComplete="off"
                value={form.username} onChange={set('username')}
                onFocus={() => setFocus('username')} onBlur={() => setFocus('')} style={inputStyle('username')}
              />
              <input
                placeholder="닉네임 (변경 가능)" type="text" autoComplete="off"
                value={form.display_name} onChange={set('display_name')}
                onFocus={() => setFocus('nickname')} onBlur={() => setFocus('')} style={inputStyle('nickname')}
              />
              <input
                placeholder="비밀번호(영문, 숫자 포함 8자 이상)" type="password" autoComplete="new-password"
                value={form.password} onChange={set('password')}
                onFocus={() => setFocus('password')} onBlur={() => setFocus('')} style={inputStyle('password')}
              />
              {error && <p style={{ margin: '2px 4px 0', fontSize: 12.5, color: '#FF4358', fontWeight: 600 }}>{error}</p>}
              <button
                type="submit" disabled={busy}
                style={{ marginTop: 6, width: '100%', fontFamily: 'inherit', height: 56, border: 'none', borderRadius: 999, background: '#191722', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <svg width="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="7" cy="7" r="2.4" /><circle cx="12" cy="5.4" r="2.4" /><circle cx="17" cy="7" r="2.4" /><path d="M12 10c3.4 0 6 2.4 6 5.2 0 2-1.7 3.3-3.4 2.7-1-.4-1.7-.6-2.6-.6s-1.6.2-2.6.6C7.7 18.5 6 17.2 6 15.2 6 12.4 8.6 10 12 10Z" /></svg>
                {busy ? '신청 중…' : '가입 요청하기'}
              </button>
            </form>
          )}

          {!done && (
            <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12.25, color: '#8b8798' }}>
              이미 계정이 있나요? <Link to="/login" style={{ color: '#FF3B5C', fontWeight: 600 }}>로그인하기</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
