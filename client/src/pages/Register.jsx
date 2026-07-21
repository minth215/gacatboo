import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');
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

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">가<span>계부</span></div>
        <div className="tagline">가입 신청</div>
        {done ? (
          <div className="card center stack">
            <p className="success" style={{ fontSize: 15 }}>✅ {done}</p>
            <Link className="btn primary block" to="/login">로그인 화면으로</Link>
          </div>
        ) : (
          <form className="card" onSubmit={submit}>
            <div className="field">
              <label>이메일</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>아이디</label>
              <input value={form.username} onChange={set('username')} placeholder="그룹 초대 등에 쓰일 아이디" />
            </div>
            <div className="field">
              <label>이름</label>
              <input value={form.display_name} onChange={set('display_name')} placeholder="표시될 이름" />
            </div>
            <div className="field">
              <label>비밀번호</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="6자 이상" />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn primary block" disabled={busy}>{busy ? '신청 중…' : '가입 신청'}</button>
            <p className="center small muted" style={{ marginTop: 14 }}>
              이미 계정이 있으신가요? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700 }}>로그인</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
