import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import PageHeader from '../components/PageHeader.jsx';
import { passwordPolicyError } from '../lib/validators.js';

// 비밀번호 보기/숨기기 토글 아이콘: 켜짐(보임)=빗금 없는 먹색 눈, 꺼짐(숨김)=빗금 있는 회색 눈
const EyeIcon = ({ visible }) => (
  visible ? (
    <svg width="17" viewBox="0 0 24 24" fill="none" stroke="#191722" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="17" viewBox="0 0 24 24" fill="none" stroke="#c7c3cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
);

export default function PasswordChange() {
  const nav = useNavigate();
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fieldInputStyle = (name) => ({
    fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#fff',
    border: `1.5px solid ${focus === name ? '#191722' : '#efeef2'}`, borderRadius: 12, padding: '13px 44px 13px 14px', outline: 'none', width: '100%',
  });
  const eyeBtnStyle = {
    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
  };

  const pwMismatch = pwConfirm.length > 0 && pwNew !== pwConfirm;
  const pwPolicyInvalid = pwNew.length > 0 && !!passwordPolicyError(pwNew);
  const canSubmit = !!(pwCurrent && pwNew && pwConfirm && pwNew === pwConfirm && !passwordPolicyError(pwNew)) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const pwErr = passwordPolicyError(pwNew);
    if (pwErr) return setError(pwErr);
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
          <div style={{ position: 'relative' }}>
            <input
              type={showCurrent ? 'text' : 'password'} value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
              onFocus={() => setFocus('current')} onBlur={() => setFocus('')}
              autoComplete="current-password" placeholder="현재 비밀번호 입력" style={fieldInputStyle('current')}
            />
            <button type="button" aria-label="비밀번호 표시" onClick={() => setShowCurrent((v) => !v)} style={eyeBtnStyle}>
              <EyeIcon visible={showCurrent} />
            </button>
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>새 비밀번호</span>
          <div style={{ position: 'relative' }}>
            <input
              type={showNew ? 'text' : 'password'} value={pwNew} onChange={(e) => setPwNew(e.target.value)}
              onFocus={() => setFocus('new')} onBlur={() => setFocus('')}
              autoComplete="new-password" placeholder="영문, 숫자 포함 8 자 이상" style={fieldInputStyle('new')}
            />
            <button type="button" aria-label="비밀번호 표시" onClick={() => setShowNew((v) => !v)} style={eyeBtnStyle}>
              <EyeIcon visible={showNew} />
            </button>
          </div>
          {pwPolicyInvalid && <span style={{ fontSize: 11.5, fontWeight: 400, color: '#FF4358' }}>영문, 숫자 포함 8 자 이상의 비밀번호만 사용 가능합니다.</span>}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>새 비밀번호 확인</span>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirm ? 'text' : 'password'} value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
              onFocus={() => setFocus('confirm')} onBlur={() => setFocus('')}
              autoComplete="new-password" placeholder="새 비밀번호 다시 입력" style={fieldInputStyle('confirm')}
            />
            <button type="button" aria-label="비밀번호 표시" onClick={() => setShowConfirm((v) => !v)} style={eyeBtnStyle}>
              <EyeIcon visible={showConfirm} />
            </button>
          </div>
          {pwMismatch && <span style={{ fontSize: 11.5, fontWeight: 400, color: '#FF4358' }}>비밀번호가 일치하지 않습니다.</span>}
        </label>

        {error && <p style={{ margin: '0 2px', fontSize: 12.5, color: '#FF4358', fontWeight: 600 }}>{error}</p>}

        <button
          onClick={submit} disabled={!canSubmit}
          style={{
            marginTop: 8, width: '100%', fontFamily: 'inherit', height: 50, border: 'none', borderRadius: 999,
            background: canSubmit ? '#191722' : '#f0eef1', color: canSubmit ? '#fff' : '#b6b2c0',
            fontSize: 14.5, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}
