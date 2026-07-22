import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Ledger from './pages/Ledger.jsx';
import TransactionEdit from './pages/TransactionEdit.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import CategoryManage from './pages/CategoryManage.jsx';
import SourceManage from './pages/SourceManage.jsx';
import Groups from './pages/Groups.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty">불러오는 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Ledger />} />
        <Route path="/new" element={<TransactionEdit />} />
        <Route path="/tx/:id" element={<TransactionEdit />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/categories/:type" element={<CategoryManage />} />
        <Route path="/settings/sources" element={<SourceManage />} />
        <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to={loading ? '/login' : '/'} replace />} />
    </Routes>
  );
}
