import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">가<span>계부</span></div>
        <div className="tagline">함께 쓰는 스마트 가계부</div>
        {!isConfigured && (
          <div className="card" style={{ borderColor: '#f3c7c8', background: '#fff8f8' }}>
            <p className="error" style={{ margin: 0 }}>
              Supabase 연결이 설정되지 않았습니다. <code>client/.env</code> 에 <code>VITE_SUPABASE_URL</code> 과 <code>VITE_SUPABASE_ANON_KEY</code> 를 설정하세요.
            </p>
          </div>
        )}
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label>이메일</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="비밀번호" />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
          <p className="center small muted" style={{ marginTop: 14 }}>
            계정이 없으신가요? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 700 }}>가입 신청</Link>
          </p>
          <p className="center small muted" style={{ marginTop: 4 }}>가입 후 관리자 승인이 필요합니다.</p>
        </form>
      </div>
    </div>
  );
}
