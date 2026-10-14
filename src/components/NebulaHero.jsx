import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, ShieldCheck, Truck, Sparkles, Smartphone, Headphones, Watch, Footprints, SprayCan, LayoutGrid } from 'lucide-react';

// Labels follow the hero design; links map onto the store's existing categories.
const CATS = [
  { label: 'Mobiles', to: '/shop?category=electronics', Icon: Smartphone },
  { label: 'Audio', to: '/shop?category=electronics', Icon: Headphones },
  { label: 'Wearables', to: '/shop?category=accessories', Icon: Watch },
  { label: 'Footwear', to: '/shop?category=fashion', Icon: Footprints },
  { label: 'Fragrances', to: '/shop?category=beauty', Icon: SprayCan },
  { label: 'More', to: '/shop', Icon: LayoutGrid },
];

// Video background picked once by screen shape; <source media> isn't honoured by every browser.
const isPhone = () => typeof window !== 'undefined' && matchMedia('(max-width: 767px)').matches;

export default function NebulaHero() {
  const rail = useRef(null), video = useRef(null);
  const phone = isPhone();
  const [page, setPage] = useState(0);
  const pages = 3;
  const onRail = () => { const r = rail.current; if (!r) return; const max = r.scrollWidth - r.clientWidth; setPage(max > 0 ? Math.round(r.scrollLeft / max * (pages - 1)) : 0); };
  const scroll = dir => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * .6, behavior: 'smooth' });

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) video.current?.pause();
  }, []);

  return (
    <section className="hx">
      <div className="hx-fade" aria-hidden="true" />

      <div className="store-container hx-inner">
        <div className="hx-copy">
          <span className="hx-kicker"><Sparkles size={15} /> New season edit</span>
          <h1>Everyday<br /><span>Extraordinary</span></h1>
          <p>Discover premium gadgets, fashion, and lifestyle products — curated for a smarter, brighter you.</p>
          <div className="hx-actions">
            <Link className="hx-cta" to="/shop">Shop Now <ArrowRight size={19} /></Link>
            <Link className="hx-ghost" to="/shop?filter=sale">Explore Deals <ArrowRight size={18} /></Link>
          </div>
          <div className="hx-trust">
            <span><ShieldCheck size={20} /> Secure checkout</span>
            <i />
            <span><Truck size={20} /> Free shipping over ₹999</span>
          </div>
        </div>
        <div className="hx-scroll" aria-hidden="true">Scroll to<br />explore more<span>↓</span></div>
      </div>
      <video ref={video} className="hx-video" autoPlay muted loop playsInline preload="auto" aria-hidden="true"
        poster={phone ? '/videos/hero-mobile.jpg' : '/videos/hero-desktop.jpg'}
        src={phone ? '/videos/hero-mobile.mp4' : '/videos/hero-desktop.mp4'} />

      <div className="store-container hx-cats-wrap">
        <button type="button" className="hx-arrow" onClick={() => scroll(-1)} aria-label="Previous categories"><ChevronLeft size={20} /></button>
        <nav className="hx-cats" ref={rail} onScroll={onRail} aria-label="Shop by category">
          {CATS.map(({ label, to, Icon }, i) => (
            <Link key={label} to={to} className={i === 0 ? 'is-first' : ''}>
              <span className="hx-cat-icon"><Icon size={26} strokeWidth={1.5} /></span>
              <b>{label}</b><ArrowRight size={15} />
            </Link>
          ))}
        </nav>
        <button type="button" className="hx-arrow" onClick={() => scroll(1)} aria-label="More categories"><ChevronRight size={20} /></button>
      </div>
      <div className="hx-dots" aria-hidden="true">{Array.from({ length: pages }, (_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
    </section>
  );
}
