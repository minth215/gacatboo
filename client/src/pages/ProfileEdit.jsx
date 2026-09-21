import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import PageHeader from '../components/PageHeader.jsx';

export default function ProfileEdit() {
  const { user } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setDone('');
    if (pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');
    if (pw !== pw2) return setError('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw new Error(err.message);
      setPw(''); setPw2('');
      setDone('비밀번호가 변경되었습니다.');
    } catch (err) {
      setError(err.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="내 정보 수정" />

      <div className="card">
        <div style={{ fontWeight: 700 }}>{user.display_name}</div>
        <div className="small muted" style={{ marginTop: 2 }}>@{user.username}{user.role === 'admin' ? ' · 관리자' : ''}</div>
      </div>

      <form className="card" onSubmit={submit}>
        <h3>비밀번호 변경</h3>
        <div className="field">
          <label>새 비밀번호</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="6자 이상" />
        </div>
        <div className="field">
          <label>비밀번호 확인</label>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" placeholder="새 비밀번호 다시 입력" />
        </div>
        {error && <p className="error">{error}</p>}
        {done && <p className="small" style={{ color: 'var(--income)', fontWeight: 700 }}>{done}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '변경 중…' : '비밀번호 변경'}</button>
      </form>
    </div>
  );
}
