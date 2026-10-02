import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import PageHeader from '../components/PageHeader.jsx';

const fieldInputStyle = {
  fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#fff',
  border: '1.5px solid #efeef2', borderRadius: 12, padding: '13px 14px', outline: 'none', width: '100%',
};

export default function PasswordChange() {
  const nav = useNavigate();
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pwMismatch = pwConfirm.length > 0 && pwNew !== pwConfirm;
  const canSubmit = !!(pwCurrent && pwNew && pwConfirm && pwNew === pwConfirm) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setError(''); setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email;
      // 현재 비밀번호가 맞는지 재인증으로 확인
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: pwCurrent });
      if (verifyErr) throw new Error('현재 비밀번호가 올바르지 않습니다.');
      const { error: updErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updErr) throw new Error(updErr.message);
      alert('비밀번호가 변경되었습니다.');
      nav(-1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="비밀번호 변경" flat />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>현재 비밀번호</span>
          <input
            type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
            autoComplete="current-password" placeholder="현재 비밀번호 입력" style={fieldInputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>새 비밀번호</span>
          <input
            type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
            autoComplete="new-password" placeholder="영문, 숫자 포함 8자 이상" style={fieldInputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>새 비밀번호 확인</span>
          <input
            type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
            autoComplete="new-password" placeholder="새 비밀번호 다시 입력"
            style={{ ...fieldInputStyle, borderColor: pwMismatch ? '#f3b6bd' : '#efeef2' }}
          />
          {pwMismatch && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c7414e' }}>비밀번호가 일치하지 않습니다.</span>}
        </label>

        {error && <p style={{ margin: '0 2px', fontSize: 12.5, color: '#FF4358', fontWeight: 600 }}>{error}</p>}

        <button
          onClick={submit} disabled={!canSubmit}
          style={{
            marginTop: 8, width: '100%', fontFamily: 'inherit', height: 50, border: 'none', borderRadius: 14,
            background: canSubmit ? '#191722' : '#f0eef1', color: canSubmit ? '#fff' : '#b6b2c0',
            fontSize: 14.5, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? '변경 중…' : '변경하기'}
        </button>
      </div>
    </div>
  );
}
