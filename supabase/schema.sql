-- Nebula store schema for Supabase.
-- Run once in Supabase Dashboard -> SQL Editor (safe to re-run).
--
-- Column names mirror the old Base44 entities so the app code and the data
-- migration script work unchanged: `id` is text (keeps Base44 ids on import),
-- and timestamps are `created_date` / `updated_date`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_date() returns trigger
language plpgsql as $$ begin new.updated_date = now(); return new; end $$;

-- ---------------------------------------------------------------- profiles (Base44 "User")
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('admin','user')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- New sign-ups get a profile row automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users can edit their own name/phone but never their own role.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------- catalogue
create table if not exists public.categories (
  id text primary key default gen_random_uuid()::text,
  name text not null, slug text not null, description text, image text, parent_id text,
  sort_order numeric default 0,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.brands (
  id text primary key default gen_random_uuid()::text,
  name text not null, slug text not null, logo text, description text,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
  name text not null, slug text not null, description text, short_description text,
  price numeric not null, sale_price numeric, currency text default 'INR',
  images jsonb default '[]', category_id text, category_name text, brand_id text, brand_name text,
  sizes jsonb default '[]', colors jsonb default '[]', stock numeric default 0, sku text,
  specifications jsonb default '{}', rating numeric default 0, reviews_count numeric default 0,
  is_featured boolean default false, is_new boolean default false, is_best_seller boolean default false, is_sale boolean default false,
  status text default 'active' check (status in ('active','draft','archived')),
  seo_title text, seo_description text, sort_order numeric default 0,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);
create unique index if not exists products_slug_key on public.products (slug);

create table if not exists public.banners (
  id text primary key default gen_random_uuid()::text,
  title text not null, subtitle text, image text, link text, cta_text text,
  status text default 'active', sort_order numeric default 0,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.collections (
  id text primary key default gen_random_uuid()::text,
  name text not null, slug text not null, description text, image text, product_ids jsonb default '[]',
  status text default 'active',
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.coupons (
  id text primary key default gen_random_uuid()::text,
  code text not null, description text,
  discount_type text not null check (discount_type in ('percentage','fixed')), discount_value numeric not null,
  min_order_value numeric default 0, max_discount numeric, expiry_date text, usage_limit numeric,
  used_count numeric default 0, is_first_order boolean default false, status text default 'active',
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

-- ---------------------------------------------------------------- customer data
-- user_id is text: new rows hold the Supabase auth uid; imported rows keep their
-- Base44 user id until that customer re-registers (see scripts/migrate-from-base44.mjs).
create table if not exists public.reviews (
  id text primary key default gen_random_uuid()::text,
  product_id text not null, product_name text, user_id text not null, user_name text,
  rating numeric not null, title text, description text, images jsonb default '[]',
  verified_purchase boolean default false, status text default 'approved',
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.wishlists (
  id text primary key default gen_random_uuid()::text,
  user_id text not null, product_id text not null, product_name text, product_image text,
  product_price numeric, product_sale_price numeric,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.addresses (
  id text primary key default gen_random_uuid()::text,
  user_id text not null, full_name text not null, phone text not null,
  address_line_1 text not null, address_line_2 text, city text not null, state text not null,
  country text not null, postal_code text not null, address_type text default 'Home', is_default boolean default false,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key default gen_random_uuid()::text,
  user_id text not null, user_name text, user_email text, order_number text not null,
  items jsonb not null default '[]', subtotal numeric, discount numeric default 0, shipping numeric, tax numeric,
  total numeric not null, coupon_code text,
  status text not null default 'placed', payment_status text not null default 'pending', payment_method text,
  address jsonb, tracking_number text, estimated_delivery text, status_history jsonb default '[]',
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);
create unique index if not exists orders_number_key on public.orders (order_number);

create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  user_id text not null, title text, message text, type text, link text, read boolean default false,
  created_by text, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

-- updated_date triggers
do $$ declare t text; begin
  foreach t in array array['profiles','categories','brands','products','banners','collections','coupons','reviews','wishlists','addresses','orders','notifications'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.touch_updated_date()', t);
  end loop;
end $$;

-- Keep product rating in sync from approved reviews (shoppers cannot write products).
create or replace function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where product_id = pid and status = 'approved'), 0),
    reviews_count = (select count(*) from public.reviews where product_id = pid and status = 'approved')
  where p.id = pid;
  return null;
end $$;
drop trigger if exists reviews_rating on public.reviews;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- Public order tracking by order number (returns only that one order, no listing).
create or replace function public.track_order(p_order_number text) returns setof public.orders
language sql stable security definer set search_path = public as $$
  select * from public.orders where order_number = upper(p_order_number) limit 1
$$;
grant execute on function public.track_order(text) to anon, authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.banners enable row level security;
alter table public.collections enable row level security;
alter table public.coupons enable row level security;
alter table public.reviews enable row level security;
alter table public.wishlists enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;

do $$ declare t text; begin
  -- drop old versions of our policies so this file can be re-run
  for t in select format('drop policy if exists %I on %I.%I', policyname, schemaname, tablename)
           from pg_policies where schemaname = 'public' and policyname like 'nebula_%' loop
    execute t;
  end loop;
end $$;

-- profiles
create policy nebula_profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy nebula_profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin());

-- catalogue: everyone reads, admins write (drafts/archived products hidden from shoppers)
create policy nebula_products_read on public.products for select using (status = 'active' or public.is_admin());
create policy nebula_products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());
do $$ declare t text; begin
  foreach t in array array['categories','brands','banners','collections'] loop
    execute format('create policy nebula_%1$s_read on public.%1$s for select using (true)', t);
    execute format('create policy nebula_%1$s_admin on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- coupons: signed-in shoppers can look up active codes; admins manage
create policy nebula_coupons_read on public.coupons for select using ((auth.uid() is not null and status = 'active') or public.is_admin());
create policy nebula_coupons_admin on public.coupons for all using (public.is_admin()) with check (public.is_admin());

-- reviews: public reads approved; signed-in users post their own; admins moderate
create policy nebula_reviews_read on public.reviews for select using (status = 'approved' or user_id = auth.uid()::text or public.is_admin());
create policy nebula_reviews_insert on public.reviews for insert with check (user_id = auth.uid()::text);
create policy nebula_reviews_admin on public.reviews for all using (public.is_admin()) with check (public.is_admin());

-- per-user tables: owner full access, admins full access
do $$ declare t text; begin
  foreach t in array array['wishlists','addresses','notifications'] loop
    execute format('create policy nebula_%1$s_own on public.%1$s for all using (user_id = auth.uid()::text or public.is_admin()) with check (user_id = auth.uid()::text or public.is_admin())', t);
  end loop;
end $$;

-- orders: owner reads + creates their own; owner may only cancel/return; admins everything
create policy nebula_orders_read on public.orders for select using (user_id = auth.uid()::text or public.is_admin());
create policy nebula_orders_insert on public.orders for insert with check (user_id = auth.uid()::text);
create policy nebula_orders_owner_update on public.orders for update
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text and status in ('cancelled','returned'));
create policy nebula_orders_admin on public.orders for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- storage (product images)
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true) on conflict (id) do nothing;
drop policy if exists nebula_uploads_read on storage.objects;
drop policy if exists nebula_uploads_write on storage.objects;
create policy nebula_uploads_read on storage.objects for select using (bucket_id = 'uploads');
create policy nebula_uploads_write on storage.objects for insert with check (bucket_id = 'uploads' and auth.uid() is not null);
