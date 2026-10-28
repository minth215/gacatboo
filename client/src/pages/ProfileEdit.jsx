import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import PageHeader from '../components/PageHeader.jsx';

const Chevron = () => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c7c3cc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export default function ProfileEdit() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  // 친구 검색 허용 / 그룹 초대 허용(기본 허용). 바꾸는 즉시 저장.
  const [privacy, setPrivacy] = useState({
    allowFriendSearch: user.allow_friend_search !== false,
    allowGroupInvite: user.allow_group_invite !== false,
  });
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const togglePrivacy = async (key) => {
    if (privacyBusy) return;
    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next); setPrivacyBusy(true);
    try {
      await db.setMyPrivacy(key === 'allowFriendSearch' ? { allowFriendSearch: next.allowFriendSearch } : { allowGroupInvite: next.allowGroupInvite });
      setUser((u) => ({ ...u, allow_friend_search: next.allowFriendSearch, allow_group_invite: next.allowGroupInvite }));
    } catch (e) {
      setPrivacy(privacy); alert(e.message);
    } finally { setPrivacyBusy(false); }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ''));
  }, []);

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="내 정보" flat />

      <div style={{ marginTop: 14, background: 'var(--k-bg-fff)', borderRadius: 20, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--k-tx-191722)', letterSpacing: '-.3px' }}>{user.display_name}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--k-tx-a29ead)' }}>@{user.username}</span>
            {user.role === 'admin' && <span className="settings-admin-badge">관리자</span>}
          </div>
          <button
            aria-label="내 정보 수정" onClick={() => nav('/settings/profile/edit')} className="profile-edit-pencil-btn"
            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--k-tx-a29ead)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}
          >
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        </div>
        <div style={{ padding: '0 18px 18px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--k-tx-a29ead)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
      </div>

      {/* 설정: 친구 검색 허용 / 그룹 초대 허용 */}
      <div style={{ marginTop: 22, background: 'var(--k-bg-fff)', borderRadius: 20, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', overflow: 'hidden' }}>
        {[
          ['allowFriendSearch', '🔍', '#eef1fb', '친구 검색 허용', '내 아이디가 검색되는 것을 허용합니다'],
          ['allowGroupInvite', '✉️', '#e8f6ee', '그룹 초대 허용', '나를 그룹에 초대하는 것을 허용합니다'],
        ].map(([key, icon, bg, label, desc], i) => (
          <div key={key} className="settings-menu-row static" style={{ ...(i ? { borderTop: '1.5px solid var(--k-divider)' } : {}) }}>
            <span className="settings-menu-tile" style={{ background: bg }}>{icon}</span>
            <span className="settings-menu-main">
              <span className="settings-menu-label">{label}</span>
              <span className="settings-menu-desc">{desc}</span>
            </span>
            <button
              type="button" role="switch" aria-checked={privacy[key]} aria-label={label}
              className={`ios-toggle${privacy[key] ? ' on' : ''}`} onClick={() => togglePrivacy(key)} disabled={privacyBusy}
            >
              <span className="ios-toggle-knob" />
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, background: 'var(--k-bg-fff)', borderRadius: 20, boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', overflow: 'hidden' }}>
        <button className="settings-menu-row" onClick={() => nav('/settings/profile/password')}>
          <span className="settings-menu-tile" style={{ background: '#eef1fb' }}>🔒</span>
          <span className="settings-menu-main"><span className="settings-menu-label">비밀번호 변경</span></span>
          <Chevron />
        </button>
        <button className="settings-menu-row" onClick={logout} style={{ borderTop: '1.5px solid var(--k-divider)' }}>
          <span className="settings-menu-tile" style={{ background: '#fff1e6' }}>🚪</span>
          <span className="settings-menu-main"><span className="settings-menu-label">로그아웃</span></span>
        </button>
        <button className="settings-menu-row" onClick={() => nav('/settings/profile/withdraw')} style={{ borderTop: '1.5px solid var(--k-divider)' }}>
          <span className="settings-menu-tile" style={{ background: '#fde8ee' }}>👋</span>
          <span className="settings-menu-main"><span className="settings-menu-label">회원 탈퇴</span></span>
          <Chevron />
        </button>
      </div>
    </div>
  );
}
