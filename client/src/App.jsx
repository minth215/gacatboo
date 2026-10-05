import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Ledger from './pages/Ledger.jsx';
import Search from './pages/Search.jsx';
import TransactionEdit from './pages/TransactionEdit.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import ProfileEdit from './pages/ProfileEdit.jsx';
import ProfileInfoEdit from './pages/ProfileInfoEdit.jsx';
import PasswordChange from './pages/PasswordChange.jsx';
import Withdraw from './pages/Withdraw.jsx';
import FriendManage from './pages/FriendManage.jsx';
import CategoryManage from './pages/CategoryManage.jsx';
import BudgetManage from './pages/BudgetManage.jsx';
import BudgetSet from './pages/BudgetSet.jsx';
import SourceManage from './pages/SourceManage.jsx';
import CardBenefits from './pages/CardBenefits.jsx';
import GroupCategoryManage from './pages/GroupCategoryManage.jsx';
import CurrencySettings from './pages/CurrencySettings.jsx';
import RecurringManage from './pages/RecurringManage.jsx';
import SettingsNotifications from './pages/SettingsNotifications.jsx';
import Notifications from './pages/Notifications.jsx';
import Groups from './pages/Groups.jsx';
import GroupCreate from './pages/GroupCreate.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import GroupEdit from './pages/GroupEdit.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Admin from './pages/Admin.jsx';
import AdminUserDetail from './pages/AdminUserDetail.jsx';
import Spinner from './components/Spinner.jsx';

function Protected({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
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
        <Route path="/search" element={<Search />} />
        <Route path="/new" element={<TransactionEdit />} />
        <Route path="/tx/:id" element={<TransactionEdit />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/new" element={<GroupCreate />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/groups/:id/edit" element={<GroupEdit />} />
        <Route path="/groups/:id/member/:memberId" element={<MemberDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/profile" element={<ProfileEdit />} />
        <Route path="/settings/profile/edit" element={<ProfileInfoEdit />} />
        <Route path="/settings/profile/password" element={<PasswordChange />} />
        <Route path="/settings/profile/withdraw" element={<Withdraw />} />
        <Route path="/settings/friends" element={<FriendManage />} />
        <Route path="/settings/categories/:type" element={<CategoryManage />} />
        <Route path="/settings/budget" element={<BudgetManage />} />
        <Route path="/settings/budget/:type/:categoryId" element={<BudgetSet />} />
        <Route path="/settings/sources" element={<SourceManage />} />
        <Route path="/settings/card-benefits" element={<CardBenefits />} />
        <Route path="/settings/group-categories" element={<GroupCategoryManage />} />
        <Route path="/settings/currency" element={<CurrencySettings />} />
        <Route path="/settings/recurring" element={<RecurringManage />} />
        <Route path="/settings/notifications" element={<SettingsNotifications />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
        <Route path="/admin/users/:id" element={<Protected adminOnly><AdminUserDetail /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to={loading ? '/login' : '/'} replace />} />
    </Routes>
  );
}
