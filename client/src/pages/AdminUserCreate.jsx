import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import PageHeader from '../components/PageHeader.jsx';
import { fieldStyle, labelStyle } from './FriendAdd.jsx';

// 관리자 > 회원 관리 > 계정 생성(즉시 승인). 생성하면 회원 관리로 돌아감.
export default function AdminUserCreate() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '', role: 'user' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      await db.createUser(form);
      nav(-1);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  const field = (key, label, props = {}) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={labelStyle}>{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={fieldStyle} {...props} />
    </label>
  );

  return (
    <div style={{ padding: '44px 0 24px' }}>
      <PageHeader title="계정 생성" flat />
      <form onSubmit={create} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {field('email', '이메일', { type: 'email', autoFocus: true })}
        {field('username', '아이디')}
        {field('display_name', '이름')}
        {field('password', '비밀번호', { type: 'password' })}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={labelStyle}>역할</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ ...fieldStyle, WebkitAppearance: 'none', appearance: 'none' }}>
            <option value="user">일반 사용자</option>
            <option value="tester">테스터</option>
            <option value="admin">관리자</option>
          </select>
        </label>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        <button className="btn-ink-pill" style={{ marginTop: 6 }} disabled={busy}>{busy ? '생성 중…' : '생성'}</button>
      </form>
    </div>
  );
}
