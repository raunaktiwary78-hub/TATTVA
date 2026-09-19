# TATTVA — Full-Stack Launch Website

TATTVA — Energy Technology Research & Innovation

## Structure
- `public/` — everything the browser gets: index.html, style.css, script.js, assets/
- `server.js` — Express server (serves ONLY public/, plus the contact API and admin panel)
- `data/messages.json` — contact form submissions (git-ignored, not web-served)
- `scripts/create-admin.js` — one-time CLI to set your admin username/password
- `.env` — your admin credentials + session secret (git-ignored, never served)

## Admin panel (private — only you can see contact messages)
1. Create your login once:
   `node scripts/create-admin.js yourusername "a-strong-password"`
   This hashes the password (bcrypt) and writes it to `.env` — the plain
   password is never stored anywhere.
2. Start the server: `npm start`
3. Go to `http://localhost:3000/admin/login` and log in.
4. Every message submitted through the contact form shows up here, newest
   first, with a "NEW" badge until you mark it read. You can mark read or
   delete each one.
5. To change the password later, just re-run step 1 with a new password —
   it overwrites the old one.
6. Login is rate-limited (8 attempts / 15 min) and the admin pages are never
   indexed by search engines (`noindex`) or cached by the browser.

Note: this is an in-app inbox, not a push/email alert — you'll see new
messages when you open `/admin`, not the instant someone submits the form.
If you want an actual email or WhatsApp ping the moment a message arrives,
that needs an email service (e.g. Resend/SendGrid) or a WhatsApp Business
API — say the word and I'll wire it in.

## Frontend
- HTML / CSS / JavaScript, responsive
- Sanskrit-inspired TATTVA identity
- Vision, mission, business model and technology sections
- SEO/social meta tags (Open Graph, Twitter card, canonical, Organization schema)
- Hero image served as compressed WebP (with JPEG fallback and a smaller mobile
  variant) instead of the original 1.9 MB PNG

## Backend
- Node.js + Express 5
- `GET /api/health` health endpoint
- `POST /api/contact` contact API — rate-limited (5 requests / 15 min / IP) and
  protected by a hidden honeypot field against basic bots
- helmet security headers (CSP) + gzip compression
- Contact messages stored locally in `data/messages.json`
- Static frontend served from `public/` only — server.js, package.json and the
  messages file are never web-accessible

## Run locally
1. Install Node.js 18+.
2. Open this folder in a terminal.
3. `npm install`
4. `npm start`
5. Open `http://localhost:3000`

## Before you deploy
1. Replace `https://tattva-energy.example.com` in `public/index.html`
   (canonical/og/twitter tags), `public/robots.txt` and `public/sitemap.xml`
   with your real domain once you have one.
2. Pick a host that runs a long-lived Node process — Render, Railway, Fly.io,
   or a VPS. (Vercel/Netlify are built for static/serverless, not a
   persistently running Express server with a local JSON file — the
   filesystem there is not reliably writable/persistent.)
3. Set the `PORT` environment variable if your host requires it (most do this
   automatically).
4. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` as
   environment variables on your host (copy the values from your local
   `.env` — don't upload the `.env` file itself). Also set `NODE_ENV=production`
   so the login cookie only travels over HTTPS.

## Important for public deployment
The local JSON store is suitable for a launch/demo backend, not a production
contact system — messages live only on that server's disk. For production,
move to a managed database and a transactional email service (so you get
notified immediately instead of having to check the file), keep secrets in
environment variables, and consider adding CAPTCHA if spam gets past the
rate limit + honeypot.

The site intentionally does not claim unverified clients, awards, revenue,
products or achievements.

## Fixed in this pass (things that would have broken in production)
- `app.get("*", ...)` is invalid in Express 5 (path-to-regexp v7) — the
  server crashed on startup. Replaced with a safe fallback handler.
- `express.static(ROOT)` served the **entire project root**, so server.js,
  package.json and data/messages.json (all contact submissions) were
  publicly downloadable. Now only `public/` is web-served.
- Hero image: 1.9 MB PNG → ~110 KB WebP (44 KB on mobile) — big load-time
  win, especially on mobile data.
- Added rate limiting + honeypot on the contact form (it had no spam
  protection at all).
- Added missing SEO/social meta tags, favicon, robots.txt, sitemap.xml,
  Organization schema.
- Accessibility: labelled form fields (previously placeholder-only), added
  aria-label to the mobile menu toggle.

## Added: private admin panel
- `/admin/login` + `/admin` — password-protected inbox for contact form
  submissions. Bcrypt-hashed password, session cookie (httpOnly, 8h expiry),
  rate-limited login, unread badges, mark-read/delete per message.
- Nothing here is publicly reachable without the password — `/admin` redirects
  to the login page for anyone not signed in, and the pages are excluded from
  search indexing and browser caching.
