import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ name }) => {
  switch (name) {
    case 'ledger':
      return (<svg viewBox="0 0 24 24" {...S}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>);
    case 'stats':
      return (<svg viewBox="0 0 24 24" {...S}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>);
    case 'groups':
      return (<svg viewBox="0 0 24 24" {...S}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
    case 'settings':
      return (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
    default:
      return null;
  }
};

const NAV = [
  { to: '/', label: '가계부', icon: 'ledger', end: true },
  { to: '/stats', label: '통계', icon: 'stats' },
  { to: '/groups', label: '그룹', icon: 'groups' },
  { to: '/settings', label: '설정', icon: 'settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();

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
            <span className="ico"><Icon name={n.icon} /></span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
