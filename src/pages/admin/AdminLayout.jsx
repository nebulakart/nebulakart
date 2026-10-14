import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingBag, Users, Tags, Ticket, Store, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', short: 'Products', icon: Package },
  { to: '/admin/orders', label: 'Orders', short: 'Orders', icon: ShoppingBag },
  { to: '/admin/customers', label: 'Customers', short: 'People', icon: Users },
  { to: '/admin/categories', label: 'Categories', short: 'Cats', icon: Tags },
  { to: '/admin/coupons', label: 'Coupons', short: 'Coupons', icon: Ticket },
];

export default function AdminLayout() {
  const { user, isAuthenticated, isLoadingAuth, authChecked, checkUserAuth, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => { if (!authChecked && !isLoadingAuth) checkUserAuth(); }, [authChecked, isLoadingAuth, checkUserAuth]);
  const ready = authChecked && !isLoadingAuth;
  const allowed = isAuthenticated && user?.role === 'admin';
  useEffect(() => { if (ready && !allowed) navigate('/admin/login', { replace: true }); }, [ready, allowed, navigate]);

  if (!ready) return <div className="admin-loading"><span /></div>;
  if (!allowed) return null;

  const current = NAV.find(n => (n.end ? pathname === n.to : pathname.startsWith(n.to))) || NAV[0];
  const initial = (user?.full_name || user?.email || 'A').charAt(0).toUpperCase();

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link to="/admin" className="admin-logo"><img src="/images/nebula-logo.webp" alt="Nebula" /><small>Admin</small></Link>
        <nav aria-label="Admin">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav${isActive ? ' active' : ''}`}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Link to="/" className="admin-nav"><Store size={18} />View store</Link>
          <button type="button" className="admin-nav" onClick={() => logout()}><LogOut size={18} />Sign out</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-top">
          <div>
            <p>Nebula console</p>
            <h1>{current.label}</h1>
          </div>
          <div className="admin-top-actions">
            <Link to="/" className="admin-chip admin-mobile-only" aria-label="View store"><Store size={18} /></Link>
            <span className="admin-avatar" title={user?.email}>{initial}</span>
          </div>
        </header>
        <div className="admin-content"><Outlet /></div>
      </div>

      <nav className="admin-tabs" aria-label="Admin">
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon size={20} /><span>{short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
