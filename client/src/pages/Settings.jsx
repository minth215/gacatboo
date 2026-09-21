import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Settings() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const items = [
    { label: '수입 분류 관리', desc: '월급·부수입 등 수입 분류 편집', to: '/settings/categories/income', ico: '📈' },
    { label: '지출 분류 관리', desc: '식당·교통 등 지출 분류 편집', to: '/settings/categories/expense', ico: '📉' },
    { label: '원천 관리', desc: '현금·은행·카드 및 세부 항목 편집', to: '/settings/sources', ico: '🏦' },
    { label: '카드 실적 관리', desc: '카드별 실적 구간에 따른 혜택 등록', to: '/settings/card-benefits', ico: '💳' },
    { label: '그룹 카테고리 관리', desc: '여행·구독 등 그룹 카테고리 편집', to: '/settings/group-categories', ico: '👥' },
  ];
  if (user.role === 'admin') {
    items.push({ label: '회원 관리', desc: '가입 승인·역할·계정 관리', to: '/admin', ico: '🛡️' });
  }

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="설정" showBack={false} />

      <div className="card" style={{ padding: 6, marginTop: 14 }}>
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

      <div className="card" style={{ padding: 6, marginTop: 14 }}>
        <button className="menu-row" onClick={() => nav('/settings/profile')}>
          <span className="menu-ico">👤</span>
          <span className="menu-main">
            <span className="menu-label">내 정보</span>
            <span className="menu-desc">{user.display_name} · @{user.username}{user.role === 'admin' ? ' · 관리자' : ''}</span>
          </span>
          <span className="menu-chevron">›</span>
        </button>
      </div>

      <button className="btn block" style={{ marginTop: 4 }} onClick={logout}>로그아웃</button>
    </div>
  );
}
