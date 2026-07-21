import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const NAV = [
  { to: '/', label: '가계부', ico: '📒', end: true },
  { to: '/stats', label: '통계', ico: '📊' },
  { to: '/groups', label: '그룹', ico: '👥' },
  { to: '/settings', label: '설정', ico: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">가<span>계부</span></div>
        <div className="user">
          <span>{user?.display_name}님{user?.role === 'admin' ? ' · 관리자' : ''}</span>
          <button className="btn sm ghost" onClick={logout}>로그아웃</button>
        </div>
      </div>

      <div className="container">
        <Outlet />
      </div>

      <nav className="bottomnav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={loc.pathname === '/admin' ? 'active' : ''}>
            <span className="ico">🛡️</span>
            관리
          </NavLink>
        )}
      </nav>
    </div>
  );
}
