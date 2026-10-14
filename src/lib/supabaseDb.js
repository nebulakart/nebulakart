// Supabase backend exposed through the Base44-style `db` interface the pages
// already use (db.entities.X.list/filter/get/create/update/delete, db.auth.*,
// db.integrations.Core.UploadFile). Every page reads `globalThis.__B44_DB__`
// at import time, so this module must be the FIRST import in main.jsx.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('[nebula] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set; the store has no backend.');
}

export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

const TABLES = {
  Product: 'products', Category: 'categories', Brand: 'brands', Banner: 'banners', Collection: 'collections',
  Coupon: 'coupons', Review: 'reviews', Wishlist: 'wishlists', Address: 'addresses', Order: 'orders',
  Notification: 'notifications', User: 'profiles',
};

const fail = (error) => { const e = new Error(error.message); e.status = error.status || error.code; e.data = error; throw e; };

// Base44 sort strings look like '-updated_date' (desc) or 'name' (asc).
const applySort = (q, sort) => {
  if (!sort) return q.order('created_date', { ascending: false });
  const desc = sort.startsWith('-');
  return q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
};

const applyQuery = (q, query = {}) => {
  for (const [k, v] of Object.entries(query)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v) q = q.in(k, v.$in);
      else if ('$ne' in v) q = q.neq(k, v.$ne);
      else if ('$gte' in v) q = q.gte(k, v.$gte);
      else if ('$lte' in v) q = q.lte(k, v.$lte);
    } else if (v === null) q = q.is(k, null);
    else q = q.eq(k, v);
  }
  return q;
};

const entity = (name) => {
  const table = TABLES[name] || name.toLowerCase() + 's';
  const from = () => { if (!supabase) throw new Error('Backend not configured'); return supabase.from(table); };
  const api = {
    async list(sort, limit) {
      let q = applySort(from().select('*'), sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q; if (error) fail(error); return data;
    },
    async filter(query, sort, limit) {
      // Public order tracking: anonymous shoppers can't read orders, so look the
      // number up through a narrow security-definer function instead.
      if (name === 'Order' && query && Object.keys(query).length === 1 && query.order_number) {
        const { data, error } = await supabase.rpc('track_order', { p_order_number: query.order_number }); if (error) fail(error); return data;
      }
      let q = applySort(applyQuery(from().select('*'), query), sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q; if (error) fail(error); return data;
    },
    async get(id) {
      const { data, error } = await from().select('*').eq('id', id).maybeSingle(); if (error) fail(error); return data;
    },
    async create(row) {
      const { data, error } = await from().insert(clean(row)).select().single(); if (error) fail(error); return data;
    },
    async bulkCreate(rows) {
      const { data, error } = await from().insert(rows.map(clean)).select(); if (error) fail(error); return data;
    },
    async update(id, patch) {
      const { data, error } = await from().update(clean(patch)).eq('id', id).select().maybeSingle(); if (error) fail(error); return data;
    },
    async updateMany(query, patch) {
      const { error } = await applyQuery(from().update(clean(patch.$set || patch)), query); if (error) fail(error);
    },
    async delete(id) {
      const { error } = await from().delete().eq('id', id); if (error) fail(error);
    },
  };
  return api;
};

// Strip fields the database owns.
const clean = (row) => { const { id: _id, created_date: _c, updated_date: _u, ...rest } = row || {}; return rest; };

const currentUser = async () => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return { ...profile, id: user.id, email: user.email, full_name: profile?.full_name || user.user_metadata?.full_name || '', role: profile?.role || 'user' };
};

const origin = () => window.location.origin;

const auth = {
  async isAuthenticated() { if (!supabase) return false; const { data } = await supabase.auth.getSession(); return !!data.session; },
  async me() { const u = await currentUser(); if (!u) { const e = new Error('Not signed in'); e.status = 401; throw e; } return u; },
  async updateMe(patch) {
    const u = await currentUser(); if (!u) throw new Error('Not signed in');
    const { role: _r, id: _i, email: _e, ...safe } = patch;
    const { error } = await supabase.from('profiles').update(safe).eq('id', u.id); if (error) fail(error);
    return currentUser();
  },
  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) fail(error); return data;
  },
  async loginWithProvider(provider, returnTo = '/') {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: origin() + returnTo } }); if (error) fail(error);
  },
  // Sign-up sends a 6-digit code; the Supabase "Confirm signup" email template must include {{ .Token }}.
  async register({ email, password }) {
    const { error } = await supabase.auth.signUp({ email, password }); if (error) fail(error);
  },
  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' }); if (error) fail(error);
    return { access_token: data.session?.access_token };
  },
  async resendOtp(email) { const { error } = await supabase.auth.resend({ type: 'signup', email }); if (error) fail(error); },
  setToken() { /* Supabase stores the session itself */ },
  async resetPasswordRequest(email) {
    // ResetPassword.jsx requires a ?token= param; the real credential is the recovery session Supabase puts in the URL.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: origin() + '/reset-password?token=recovery' }); if (error) fail(error);
  },
  async resetPassword({ newPassword }) { const { error } = await supabase.auth.updateUser({ password: newPassword }); if (error) fail(error); },
  async logout(redirectTo) { await supabase?.auth.signOut(); window.location.href = redirectTo || '/'; },
  redirectToLogin(returnTo) { window.location.href = '/login?returnTo=' + encodeURIComponent(new URL(returnTo, origin()).pathname); },
};

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const ext = (file.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type, upsert: false }); if (error) fail(error);
      return { file_url: supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl };
    },
  },
};

export const db = {
  auth,
  entities: new Proxy({}, { get: (_, name) => entity(String(name)) }),
  integrations,
  app: { async getPublicSettings() { return { id: 'nebula', public_settings: {} }; } },
};

globalThis.__B44_DB__ = db;
export default db;
