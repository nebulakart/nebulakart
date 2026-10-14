import React from "react";
import { Link } from "react-router-dom";
import { Truck, ShieldCheck, Heart } from "lucide-react";

// Split auth screen: brand panel (desktop only) + neumorphic form card.
// `variant="admin"` swaps the brand panel copy for the staff console.
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children, variant }) {
  const admin = variant === "admin";
  return (
    <div className={`auth-shell${admin ? " is-admin" : ""}`}>
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-orbs"><i /><i /><i /></div>
        <Link to="/" className="auth-brand-logo"><img src="/images/nebula-logo.webp" alt="" /></Link>
        <div className="auth-brand-copy">
          <span>{admin ? "Staff console" : "More than products"}</span>
          <h2>{admin ? <>Run the store,<br /><em>beautifully.</em></> : <>Everyday<br /><em>Extraordinary</em></>}</h2>
          {admin
            ? <p>Products, prices, orders and customers. One calm place.</p>
            : <ul>
                <li><Truck size={18} /> Free shipping over ₹999</li>
                <li><ShieldCheck size={18} /> Secure checkout</li>
                <li><Heart size={18} /> Wishlist across devices</li>
              </ul>}
        </div>
      </aside>

      <main className="auth-main">
        <Link to="/" className="auth-mobile-logo"><img src="/images/nebula-logo.webp" alt="Nebula" /></Link>
        <div className="auth-card">
          <div className="auth-head">
            {Icon && <span className="auth-icon"><Icon size={24} aria-hidden="true" /></span>}
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <p className="auth-foot">{footer}</p>}
      </main>
    </div>
  );
}
