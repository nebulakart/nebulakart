const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, X, Search, Package, Archive, ArchiveRestore, ImagePlus, Loader2 } from 'lucide-react';

import { useToast } from '@/components/ui/use-toast';
import { formatPrice, slugify, calculateDiscount } from '@/lib/shop-utils';

const EMPTY_PRODUCT = {
  name: '', slug: '', description: '', short_description: '', price: '', sale_price: '',
  images: [], category_name: 'Fashion', brand_name: 'Nebula', sizes: [], colors: [],
  stock: 0, sku: '', specifications: {}, is_featured: false, is_new: false, is_best_seller: false,
  is_sale: false, status: 'active', rating: 0, reviews_count: 0,
};

const CATEGORIES = ['Fashion', 'Electronics', 'Accessories', 'Beauty', 'Home', 'Lifestyle'];
const BRANDS = ['Nebula', 'Cosmos', 'Stellar', 'Lunar', 'Aurora', 'Vortex'];
const FILTERS = ['all', 'active', 'draft', 'archived', 'low stock'];

export default function AdminProducts() {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [sizesInput, setSizesInput] = useState('');
  const [colorsInput, setColorsInput] = useState('');
  const [specs, setSpecs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { loadProducts(); }, []);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  const loadProducts = async () => {
    try {
      setProducts(await db.entities.Product.list('-updated_date', 200));
    } catch { /* ignore */ }
    setLoading(false);
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const openNew = () => {
    setForm(EMPTY_PRODUCT); setEditingId(null);
    setSizesInput(''); setColorsInput(''); setSpecs([]);
    setShowForm(true);
  };

  const handleEdit = (p) => {
    setForm({ ...EMPTY_PRODUCT, ...p, sale_price: p.sale_price || '', images: p.images || [] });
    setSizesInput(p.sizes?.join(', ') || '');
    setColorsInput(p.colors?.join(', ') || '');
    setSpecs(Object.entries(p.specifications || {}).map(([k, v]) => ({ k, v: String(v) })));
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await db.integrations.Core.UploadFile({ file });
        if (file_url) urls.push(file_url);
      }
      setForm(f => ({ ...f, images: [...f.images, ...urls] }));
    } catch {
      toast({ title: 'Image upload failed', variant: 'destructive' });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addImageUrl = () => {
    const url = prompt('Paste image URL');
    if (url?.trim()) setForm(f => ({ ...f, images: [...f.images, url.trim()] }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    const price = Number(form.price), sale = form.sale_price ? Number(form.sale_price) : null;
    if (!form.name || !price) { toast({ title: 'Name and price are required', variant: 'destructive' }); return; }
    if (sale && sale >= price) { toast({ title: 'Sale price must be lower than price', variant: 'destructive' }); return; }
    const data = {
      ...form,
      slug: form.slug || slugify(form.name),
      price,
      sale_price: sale,
      stock: Number(form.stock) || 0,
      sizes: sizesInput.split(',').map(s => s.trim()).filter(Boolean),
      colors: colorsInput.split(',').map(c => c.trim()).filter(Boolean),
      specifications: Object.fromEntries(specs.filter(s => s.k.trim()).map(s => [s.k.trim(), s.v.trim()])),
      is_sale: !!sale,
    };
    setSaving(true);
    try {
      if (editingId) await db.entities.Product.update(editingId, data);
      else await db.entities.Product.create(data);
      toast({ title: editingId ? 'Product updated' : 'Product created' });
      setShowForm(false);
      loadProducts();
    } catch {
      toast({ title: 'Failed to save product', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await db.entities.Product.delete(id);
      loadProducts();
      toast({ title: 'Product deleted' });
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    }
  };

  const toggleStatus = async (p) => {
    try {
      await db.entities.Product.update(p.id, { status: p.status === 'archived' ? 'active' : 'archived' });
      loadProducts();
    } catch { /* ignore */ }
  };

  const filtered = products
    .filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => filter === 'all' || (filter === 'low stock' ? (p.stock ?? 0) <= 5 : p.status === filter));
  const discount = calculateDiscount(Number(form.price), Number(form.sale_price));

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or SKU" aria-label="Search products" />
        </div>
        <button type="button" onClick={openNew} className="adm-primary"><Plus size={18} /> Add product</button>
      </div>

      <div className="adm-pills" role="tablist">
        {FILTERS.map(f => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
            {f} <small>{f === 'all' ? products.length : products.filter(p => f === 'low stock' ? (p.stock ?? 0) <= 5 : p.status === f).length}</small>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="adm-empty">Loading products…</div>
      ) : !filtered.length ? (
        <div className="adm-empty"><Package size={28} /><p>No products here yet.</p><button type="button" className="adm-primary" onClick={openNew}><Plus size={16} /> Add your first product</button></div>
      ) : (
        <div className="adm-product-grid">
          {filtered.map(p => {
            const off = calculateDiscount(p.price, p.sale_price);
            return (
              <article key={p.id} className="adm-product">
                <div className="adm-product-img">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : <Package size={28} />}
                  <span className={`adm-status ${p.status}`}>{p.status}</span>
                  {off > 0 && <span className="adm-off">-{off}%</span>}
                </div>
                <div className="adm-product-body">
                  <h3>{p.name}</h3>
                  <p className="adm-meta">{p.category_name}{p.sku ? ` · ${p.sku}` : ''}</p>
                  <div className="adm-price">
                    <strong>{formatPrice(p.sale_price || p.price)}</strong>
                    {off > 0 && <s>{formatPrice(p.price)}</s>}
                  </div>
                  <p className={`adm-stock${(p.stock ?? 0) <= 5 ? ' low' : ''}`}>{p.stock ?? 0} in stock</p>
                </div>
                <div className="adm-product-actions">
                  <button type="button" onClick={() => handleEdit(p)} aria-label="Edit"><Edit2 size={16} /></button>
                  <button type="button" onClick={() => toggleStatus(p)} aria-label={p.status === 'archived' ? 'Restore' : 'Archive'}>{p.status === 'archived' ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
                  <button type="button" onClick={() => handleDelete(p.id)} aria-label="Delete" className="danger"><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="adm-sheet-backdrop" onClick={() => setShowForm(false)}>
          <form className="adm-sheet" onClick={e => e.stopPropagation()} onSubmit={handleSave}>
            <header>
              <h2>{editingId ? 'Edit product' : 'New product'}</h2>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button>
            </header>

            <div className="adm-sheet-body">
              <section>
                <h4>Photos</h4>
                <div className="adm-images">
                  {form.images.map((src, i) => (
                    <div key={src + i} className="adm-thumb">
                      <img src={src} alt="" />
                      {i === 0 && <span>Cover</span>}
                      <button type="button" aria-label="Remove image" onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}><X size={12} /></button>
                    </div>
                  ))}
                  <label className="adm-upload">
                    {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                    <span>{uploading ? 'Uploading' : 'Upload'}</span>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleUpload([...e.target.files])} />
                  </label>
                </div>
                <button type="button" className="adm-link" onClick={addImageUrl}>or add image by URL</button>
              </section>

              <section>
                <h4>Basics</h4>
                <label className="adm-field"><span>Name *</span><input value={form.name} onChange={set('name')} required /></label>
                <div className="adm-row">
                  <label className="adm-field"><span>Category</span><select value={form.category_name} onChange={set('category_name')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
                  <label className="adm-field"><span>Brand</span><select value={form.brand_name} onChange={set('brand_name')}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></label>
                </div>
                <label className="adm-field"><span>Short description</span><input value={form.short_description} onChange={set('short_description')} placeholder="One line shown on cards" /></label>
                <label className="adm-field"><span>Full description</span><textarea rows={4} value={form.description} onChange={set('description')} /></label>
              </section>

              <section>
                <h4>Pricing & stock</h4>
                <div className="adm-row">
                  <label className="adm-field"><span>Price (₹) *</span><input type="number" inputMode="decimal" min="0" value={form.price} onChange={set('price')} required /></label>
                  <label className="adm-field"><span>Sale price (₹)</span><input type="number" inputMode="decimal" min="0" value={form.sale_price} onChange={set('sale_price')} /></label>
                </div>
                {form.price > 0 && (
                  <p className="adm-price-preview">
                    Customers see <strong>{formatPrice(form.sale_price || form.price)}</strong>
                    {discount > 0 && <> <s>{formatPrice(form.price)}</s> <em>{discount}% off</em></>}
                  </p>
                )}
                <div className="adm-row">
                  <label className="adm-field"><span>Stock</span><input type="number" inputMode="numeric" min="0" value={form.stock} onChange={set('stock')} /></label>
                  <label className="adm-field"><span>SKU</span><input value={form.sku} onChange={set('sku')} /></label>
                </div>
              </section>

              <section>
                <h4>Variants</h4>
                <label className="adm-field"><span>Sizes</span><input value={sizesInput} onChange={e => setSizesInput(e.target.value)} placeholder="S, M, L, XL" /></label>
                <label className="adm-field"><span>Colours</span><input value={colorsInput} onChange={e => setColorsInput(e.target.value)} placeholder="Black, White, Lilac" /></label>
              </section>

              <section>
                <h4>Specifications</h4>
                {specs.map((s, i) => (
                  <div key={i} className="adm-spec">
                    <input placeholder="e.g. Material" value={s.k} onChange={e => setSpecs(x => x.map((y, j) => j === i ? { ...y, k: e.target.value } : y))} aria-label="Specification name" />
                    <input placeholder="e.g. Cotton" value={s.v} onChange={e => setSpecs(x => x.map((y, j) => j === i ? { ...y, v: e.target.value } : y))} aria-label="Specification value" />
                    <button type="button" aria-label="Remove" onClick={() => setSpecs(x => x.filter((_, j) => j !== i))}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" className="adm-link" onClick={() => setSpecs(x => [...x, { k: '', v: '' }])}><Plus size={14} /> Add specification</button>
              </section>

              <section>
                <h4>Visibility</h4>
                <div className="adm-pills">
                  {['active', 'draft', 'archived'].map(s => (
                    <button key={s} type="button" aria-selected={form.status === s} onClick={() => setForm(f => ({ ...f, status: s }))}>{s}</button>
                  ))}
                </div>
                <div className="adm-toggles">
                  {[['is_featured', 'Featured'], ['is_new', 'New arrival'], ['is_best_seller', 'Best seller']].map(([key, label]) => (
                    <label key={key} className="adm-switch"><input type="checkbox" checked={!!form[key]} onChange={set(key)} /><i />{label}</label>
                  ))}
                </div>
              </section>
            </div>

            <footer>
              <button type="button" className="adm-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="adm-primary" disabled={saving || uploading}>{saving ? <Loader2 size={16} className="animate-spin" /> : null}{editingId ? 'Save changes' : 'Create product'}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
