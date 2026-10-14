# Going live: Supabase + Vercel + your domain

## 1. Supabase database
1. Supabase Dashboard → your project → **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
2. **Authentication → Sign In / Providers → Email**: keep "Confirm email" on.
3. **Authentication → Emails → Confirm signup**: the template must contain `{{ .Token }}` (the 6-digit code the sign-up page asks for). Example body: `Your Nebula code is {{ .Token }}`.
4. **Authentication → URL Configuration**:
   - Site URL: `https://yourdomain.com`
   - Redirect URLs: `https://yourdomain.com/**`, `https://*.vercel.app/**`, `http://localhost:5173/**`
5. Google sign-in (optional): **Authentication → Providers → Google**, paste a Google OAuth client ID/secret. In Google Cloud, the authorised redirect URI is the callback URL Supabase shows on that screen.

## 2. Local setup
```
copy .env.example .env.local     # then paste Project URL + anon public key
npm run dev
```

## 3. Make yourself admin
Sign up on the site, then in Supabase **SQL Editor**:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```
Log in at `/admin/login`.

## 4. Move data from Base44
1. Base44 dashboard → Data → export each entity (Product, Category, Order, Coupon, Review, Address, Wishlist, User …) as JSON or CSV into one folder, files named `Product.json`, `Order.csv`, …
2. Supabase → Project Settings → API → copy the **service_role** key (secret — never put it in `.env.local` or the website).
3. PowerShell:
   ```
   $env:SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="..."
   node scripts/migrate-from-base44.mjs .\base44-export           # dry run
   node scripts/migrate-from-base44.mjs .\base44-export --write   # import
   ```
4. Customer passwords can't be exported, so customers sign up again with the same email. Afterwards run
   `node scripts/migrate-from-base44.mjs .\base44-export --relink --write` to attach their old orders, addresses and wishlist to the new account.
5. Product images that point at Base44 URLs keep working only while Base44 hosts them. Re-upload important ones from the admin product form.

## 5. Deploy on Vercel
1. Push the repo to GitHub.
2. vercel.com → **Add New → Project** → import the repo (framework: Vite, already set in `vercel.json`).
3. **Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` → Deploy.

## 6. Connect your domain
1. Vercel project → **Settings → Domains** → add `yourdomain.com` and `www.yourdomain.com`.
2. At your domain registrar's DNS settings, add the records Vercel shows. Usually:
   - `A` record, host `@` → `76.76.21.21`
   - `CNAME` record, host `www` → `cname.vercel-dns.com`
3. Wait for DNS (minutes to a few hours). Vercel issues HTTPS automatically.
4. Make sure the domain is in Supabase **URL Configuration** (step 1.4).
