#!/usr/bin/env node
// Copies data exported from Base44 into Supabase.
//
// 1. In the Base44 dashboard, open Data, and export each entity (Product,
//    Category, Order, ...) as JSON or CSV into one folder, named after the
//    entity: Product.json, Order.csv, etc.
// 2. Run supabase/schema.sql in the Supabase SQL editor first.
// 3. Run (PowerShell):
//      $env:SUPABASE_URL="https://xxxx.supabase.co"
//      $env:SUPABASE_SERVICE_ROLE_KEY="<service role key>"   # never put this in the website / .env.local
//      node scripts/migrate-from-base44.mjs ./base44-export            # dry run, prints what it would do
//      node scripts/migrate-from-base44.mjs ./base44-export --write    # actually writes
//
// Records keep their Base44 ids, so links between them (order -> product,
// review -> product) survive. Re-running is safe: rows are upserted by id.
//
// Users: passwords cannot be exported from Base44, so customer accounts are not
// recreated. Their orders/addresses/wishlists are imported with the old Base44
// user id. When a customer signs up again with the same email, run with
// --relink to move those rows onto their new account.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const [dir, ...flags] = process.argv.slice(2);
const WRITE = flags.includes('--write');
const RELINK = flags.includes('--relink');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// entity -> table; order matters only for readability (no FKs between them)
const TABLES = { Category: 'categories', Brand: 'brands', Product: 'products', Banner: 'banners', Collection: 'collections',
  Coupon: 'coupons', Review: 'reviews', Wishlist: 'wishlists', Address: 'addresses', Order: 'orders', Notification: 'notifications' };
const USER_TABLES = ['reviews', 'wishlists', 'addresses', 'orders', 'notifications'];

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(Boolean));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

function load(entity) {
  for (const ext of ['json', 'csv']) {
    const f = path.join(dir, `${entity}.${ext}`);
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
    const data = ext === 'json' ? JSON.parse(text) : parseCSV(text);
    return Array.isArray(data) ? data : data.records || data.data || [];
  }
  return null;
}

// Allowed columns per table, read from supabase/schema.sql (fields not in the schema are skipped).
const SCHEMA = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
function columns(table) {
  const m = SCHEMA.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  const known = new Set();
  if (m) for (const line of m[1].split('\n')) for (const part of line.split(/,(?![^(]*\))/)) {
    const name = part.trim().split(/\s+/)[0];
    if (/^[a-z_0-9]+$/.test(name) && !['check', 'primary'].includes(name)) known.add(name);
  }
  return known;
}

const maybeJSON = (v) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) { try { return JSON.parse(t); } catch { /* keep string */ } }
  if (t === 'true') return true; if (t === 'false') return false;
  if (t === '') return null;
  return v;
};

async function importEntity(entity, table) {
  const rows = load(entity);
  if (!rows) { console.log(`- ${entity}: no export file, skipped`); return; }
  const cols = columns(table);
  const dropped = new Set();
  const out = rows.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) { if (cols.has(k)) o[k] = maybeJSON(v); else dropped.add(k); }
    for (const n of ['price', 'sale_price', 'stock', 'rating', 'reviews_count', 'sort_order', 'total', 'subtotal', 'discount', 'shipping', 'tax', 'discount_value', 'min_order_value', 'max_discount', 'usage_limit', 'used_count', 'product_price', 'product_sale_price'])
      if (o[n] != null && o[n] !== '') o[n] = Number(o[n]); else if (o[n] === '') o[n] = null;
    return o;
  }).filter(o => o.id);
  console.log(`- ${entity}: ${out.length} rows -> ${table}${dropped.size ? ` (ignored fields: ${[...dropped].join(', ')})` : ''}`);
  if (!WRITE) return;
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await sb.from(table).upsert(out.slice(i, i + 500), { onConflict: 'id' });
    if (error) { console.error(`  ! ${entity} batch ${i}: ${error.message}`); process.exitCode = 1; }
  }
}

async function relink() {
  // Old Base44 users export: id + email. New accounts: profiles.id + email.
  const oldUsers = load('User') || [];
  const { data: profiles, error } = await sb.from('profiles').select('id,email'); if (error) throw error;
  const byEmail = new Map(profiles.map(p => [p.email?.toLowerCase(), p.id]));
  let moved = 0;
  for (const u of oldUsers) {
    const newId = byEmail.get(String(u.email || '').toLowerCase());
    if (!newId || !u.id || newId === u.id) continue;
    for (const t of USER_TABLES) {
      if (!WRITE) { console.log(`  would move ${t} rows ${u.id} -> ${newId} (${u.email})`); continue; }
      const { error: e } = await sb.from(t).update({ user_id: newId }).eq('user_id', u.id); if (e) console.error(`  ! ${t}: ${e.message}`);
    }
    if (u.role === 'admin' && WRITE) await sb.from('profiles').update({ role: 'admin' }).eq('id', newId);
    moved++;
  }
  console.log(`relinked ${moved} customer(s)`);
}

if (!dir || !fs.existsSync(dir)) { console.error('Usage: node scripts/migrate-from-base44.mjs <export-folder> [--write] [--relink]'); process.exit(1); }
console.log(WRITE ? 'Writing to Supabase…' : 'Dry run (add --write to import)…');
if (RELINK) await relink();
else for (const [entity, table] of Object.entries(TABLES)) await importEntity(entity, table);
