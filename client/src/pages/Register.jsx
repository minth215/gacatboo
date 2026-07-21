import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Register() {
  const [form, setForm] = useState({ username: '', display_name: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api.post('/auth/register', {
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        password: form.password,
      });
      setDone(d.message);
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
              <label>아이디</label>
              <input value={form.username} onChange={set('username')} placeholder="로그인에 사용할 아이디" />
            </div>
            <div className="field">
              <label>이름</label>
              <input value={form.display_name} onChange={set('display_name')} placeholder="표시될 이름" />
            </div>
            <div className="field">
              <label>비밀번호</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="4자 이상" />
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
