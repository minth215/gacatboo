import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Settings() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const items = [
    { label: '수입 분류 관리', desc: '월급·부수입 등 수입 분류 편집', to: '/settings/categories/income', ico: '📈' },
    { label: '지출 분류 관리', desc: '식당·교통 등 지출 분류 편집', to: '/settings/categories/expense', ico: '📉' },
    { label: '원천 관리', desc: '현금·은행·카드 및 세부 항목 편집', to: '/settings/sources', ico: '🏦' },
  ];
  if (user.role === 'admin') {
    items.push({ label: '회원 관리', desc: '가입 승인·역할·계정 관리', to: '/admin', ico: '🛡️' });
  }

  return (
    <div>
      <h2 style={{ margin: '4px 2px 14px', fontSize: 20 }}>설정</h2>

      <div className="card" style={{ padding: 6 }}>
        {items.map((it) => (
          <button key={it.to} className="menu-row" onClick={() => nav(it.to)}>
            <span className="menu-ico">{it.ico}</span>
            <span className="menu-main">
              <span className="menu-label">{it.label}</span>
              <span className="menu-desc">{it.desc}</span>
            </span>
            <span className="menu-chevron">›</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="between">
          <div>
            <div style={{ fontWeight: 700 }}>{user.display_name}</div>
            <div className="small muted">@{user.username}{user.role === 'admin' ? ' · 관리자' : ''}</div>
          </div>
          <button className="btn sm" onClick={logout}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}
