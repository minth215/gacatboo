import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import PageHeader from '../components/PageHeader.jsx';

export default function ProfileEdit() {
  const { user, setUser, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState(user.display_name);
  const [username, setUsername] = useState(user.username);
  const [profileError, setProfileError] = useState('');
  const [profileDone, setProfileDone] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ''));
  }, []);

  const saveProfile = async () => {
    setProfileError(''); setProfileDone('');
    const dn = displayName.trim();
    const un = username.trim();
    if (!dn) return setProfileError('닉네임을 입력하세요.');
    if (!un) return setProfileError('아이디를 입력하세요.');
    setProfileBusy(true);
    try {
      const updated = await db.updateMyProfile(un, dn);
      setUser(updated);
      setDisplayName(updated.display_name);
      setUsername(updated.username);
      setProfileDone('저장되었습니다.');
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileBusy(false);
    }
  };

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
      <PageHeader title="내 정보" flat />

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>계정 정보</h3>
          {user.role === 'admin' && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 7px' }}>관리자</span>
          )}
        </div>
        <div className="field">
          <label>이메일</label>
          <input value={email} disabled />
        </div>
        <div className="field">
          <label>닉네임</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="표시될 이름" />
        </div>
        <div className="field">
          <label>아이디</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="그룹 초대 등에 쓰일 아이디" />
        </div>
        {profileError && <p className="error">{profileError}</p>}
        {profileDone && <p className="small" style={{ color: 'var(--income)', fontWeight: 700 }}>{profileDone}</p>}
        <button className="btn primary block" disabled={profileBusy} onClick={saveProfile}>{profileBusy ? '저장 중…' : '저장'}</button>
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

      <button className="btn block" style={{ marginTop: 4 }} onClick={logout}>로그아웃</button>
    </div>
  );
}
