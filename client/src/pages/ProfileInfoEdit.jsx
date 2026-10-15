import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { db } from '../lib/db.js';
import PageHeader from '../components/PageHeader.jsx';

export default function ProfileInfoEdit() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState(user.display_name);
  const [username, setUsername] = useState(user.username);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState('');

  const fieldInputStyle = (name) => ({
    fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: '#fff',
    border: `1.5px solid ${focus === name ? '#191722' : '#efeef2'}`, borderRadius: 12, padding: '13px 14px', outline: 'none', width: '100%',
  });

  const save = async () => {
    setError('');
    const dn = displayName.trim();
    const un = username.trim();
    if (!dn) return setError('닉네임을 입력하세요.');
    if (!un) return setError('아이디를 입력하세요.');
    setBusy(true);
    try {
      const updated = await db.updateMyProfile(un, dn);
      setUser(updated);
      nav(-1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="내 정보 변경" flat />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>닉네임</span>
          <input
            type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            onFocus={() => setFocus('nickname')} onBlur={() => setFocus('')}
            placeholder="닉네임 입력" style={fieldInputStyle('nickname')}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6c6779' }}>아이디</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: `1.5px solid ${focus === 'username' ? '#191722' : '#efeef2'}`, borderRadius: 12, padding: '13px 14px' }}>
            <span style={{ fontSize: 13.75, fontWeight: 600, color: '#a29ead' }}>@</span>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              onFocus={() => setFocus('username')} onBlur={() => setFocus('')}
              placeholder="아이디 입력"
              style={{ flex: 1, fontFamily: 'inherit', fontSize: 13.75, color: '#191722', background: 'transparent', border: 'none', outline: 'none', minWidth: 0, padding: 0 }}
            />
          </div>
        </label>

        {error && <p style={{ margin: '0 2px', fontSize: 12.5, color: '#FF4358', fontWeight: 600 }}>{error}</p>}

        <button
          onClick={save} disabled={busy}
          style={{ marginTop: 8, width: '100%', fontFamily: 'inherit', height: 50, border: 'none', borderRadius: 999, background: '#191722', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}
