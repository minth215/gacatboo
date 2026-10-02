import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import PageHeader from '../components/PageHeader.jsx';

const Chevron = () => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c7c3cc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export default function ProfileEdit() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ''));
  }, []);

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="내 정보" flat />

      <div style={{ marginTop: 14, background: '#fff', borderRadius: 20, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#191722', letterSpacing: '-.3px' }}>{user.display_name}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#a29ead' }}>@{user.username}</span>
            {user.role === 'admin' && <span className="settings-admin-badge">관리자</span>}
          </div>
          <button
            aria-label="내 정보 수정" onClick={() => nav('/settings/profile/edit')} className="profile-edit-pencil-btn"
            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: '#a29ead', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}
          >
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        </div>
        <div style={{ padding: '0 18px 18px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 400, color: '#a29ead', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
      </div>

      <div style={{ marginTop: 22, background: '#fff', borderRadius: 20, boxShadow: '0 4px 16px rgba(25,23,34,.05)', overflow: 'hidden' }}>
        <button className="settings-menu-row" onClick={() => nav('/settings/profile/password')}>
          <span className="settings-menu-tile" style={{ background: '#eef1fb' }}>🔒</span>
          <span className="settings-menu-main"><span className="settings-menu-label">비밀번호 변경</span></span>
          <Chevron />
        </button>
        <button className="settings-menu-row" onClick={logout} style={{ borderTop: '1.5px solid #f2f1f5' }}>
          <span className="settings-menu-tile" style={{ background: '#fff1e6' }}>🚪</span>
          <span className="settings-menu-main"><span className="settings-menu-label">로그아웃</span></span>
        </button>
        <button className="settings-menu-row" onClick={() => nav('/settings/profile/withdraw')} style={{ borderTop: '1.5px solid #f2f1f5' }}>
          <span className="settings-menu-tile" style={{ background: '#fde8ee' }}>👋</span>
          <span className="settings-menu-main"><span className="settings-menu-label">회원 탈퇴</span></span>
          <Chevron />
        </button>
      </div>
    </div>
  );
}
