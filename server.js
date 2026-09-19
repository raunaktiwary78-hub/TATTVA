require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const IS_PROD = process.env.NODE_ENV === "production";

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]", "utf8");

// Needed when deployed behind a reverse proxy (Render/Railway/Heroku/etc.)
// so rate limiting, secure cookies and logging see the real client, not the proxy.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(compression());
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET && IS_PROD) {
  console.warn(
    "WARNING: SESSION_SECRET is not set. Run `node scripts/create-admin.js <user> <password>` to generate one."
  );
}

app.use(
  session({
    name: "tattva.sid",
    secret: process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

// Only the public/ folder is web-servable. server.js, package.json, .env and
// data/messages.json (contact submissions) stay off the internet.
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (/\.(webp|jpg|jpeg|png|svg)$/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    },
  })
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "TATTVA API", time: new Date().toISOString() });
});

// ---------- Contact form ----------

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many messages sent. Please try again later." },
});

function readMessages() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), "utf8");
}

app.post("/api/contact", contactLimiter, (req, res) => {
  const { name = "", email = "", message = "", company = "" } = req.body || {};

  // Honeypot: real visitors never fill this hidden field; bots usually do.
  if (String(company).trim().length > 0) {
    return res.status(201).json({ ok: true, message: "Message received. TATTVA will get back to you." });
  }

  const clean = {
    name: String(name).trim().slice(0, 100),
    email: String(email).trim().slice(0, 160),
    message: String(message).trim().slice(0, 3000),
  };

  if (!clean.name || !clean.email || !clean.message) {
    return res.status(400).json({ ok: false, error: "Name, email and message are required." });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email);
  if (!emailOk) return res.status(400).json({ ok: false, error: "Please provide a valid email." });

  const messages = readMessages();
  messages.push({
    ...clean,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    isRead: false,
  });
  writeMessages(messages);

  res.status(201).json({ ok: true, message: "Message received. TATTVA will get back to you." });
});

// ---------- Admin ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

function renderLogin({ error, notConfigured } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin Login — TATTVA</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/admin.css"></head>
<body class="admin-body">
<div class="admin-login-card">
<div class="admin-brand"><span class="mark">&#9670;</span><b>TATTVA</b><small>ADMIN</small></div>
${notConfigured ? `<p class="admin-error">No admin account exists yet. On the server, run:<br><code>node scripts/create-admin.js &lt;username&gt; &lt;password&gt;</code><br>then restart the server.</p>` : ""}
${error ? `<p class="admin-error">Invalid username or password.</p>` : ""}
<form method="POST" action="/admin/login" class="admin-form">
<label for="u">Username</label>
<input id="u" name="username" autocomplete="username" required>
<label for="p">Password</label>
<input id="p" name="password" type="password" autocomplete="current-password" required>
<button type="submit">LOG IN</button>
</form>
</div>
</body></html>`;
}

function renderDashboard({ username, messages }) {
  const unreadCount = messages.filter((m) => !m.isRead).length;
  const rows = messages
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((m) => `
      <div class="admin-msg ${m.isRead ? "" : "unread"}">
        <div class="admin-msg-head">
          ${m.isRead ? "" : '<span class="badge">NEW</span>'}
          <strong>${escapeHtml(m.name)}</strong>
          <a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>
          <span class="admin-msg-date">${new Date(m.createdAt).toLocaleString()}</span>
        </div>
        <p>${escapeHtml(m.message)}</p>
        <div class="admin-msg-actions">
          ${m.isRead ? "" : `<form method="POST" action="/admin/messages/${m.id}/read"><button type="submit">Mark read</button></form>`}
          <form method="POST" action="/admin/messages/${m.id}/delete" onsubmit="return confirm('Delete this message?');"><button type="submit" class="danger">Delete</button></form>
        </div>
      </div>`)
    .join("") || `<p class="admin-empty">No messages yet.</p>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin — TATTVA</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/admin.css"></head>
<body class="admin-body">
<header class="admin-header">
<div class="admin-brand"><span class="mark">&#9670;</span><b>TATTVA</b><small>ADMIN</small></div>
<div class="admin-header-right">
<span>Signed in as ${escapeHtml(username)}${unreadCount ? ` · <b>${unreadCount} new</b>` : ""}</span>
<form method="POST" action="/admin/logout"><button type="submit">Log out</button></form>
</div>
</header>
<main class="admin-main">
<h1>Contact messages</h1>
${rows}
</main>
</body></html>`;
}

app.get("/admin/login", noStore, (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect("/admin");
  const configured = process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH;
  res.send(renderLogin({ notConfigured: !configured, error: req.query.error === "1" }));
});

app.post("/admin/login", noStore, loginLimiter, (req, res) => {
  const { username = "", password = "" } = req.body || {};
  const okUser = process.env.ADMIN_USERNAME;
  const okHash = process.env.ADMIN_PASSWORD_HASH;

  if (!okUser || !okHash) {
    return res.send(renderLogin({ notConfigured: true }));
  }

  const validUser = username === okUser;
  const validPass = validUser && bcrypt.compareSync(String(password), okHash);

  if (!validUser || !validPass) {
    return res.redirect("/admin/login?error=1");
  }

  req.session.regenerate((err) => {
    if (err) return res.redirect("/admin/login?error=1");
    req.session.isAdmin = true;
    req.session.username = username;
    res.redirect("/admin");
  });
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

app.get("/admin", noStore, requireAdmin, (req, res) => {
  res.send(renderDashboard({ username: req.session.username, messages: readMessages() }));
});

app.post("/admin/messages/:id/read", requireAdmin, (req, res) => {
  const messages = readMessages().map((m) =>
    m.id === req.params.id ? { ...m, isRead: true } : m
  );
  writeMessages(messages);
  res.redirect("/admin");
});

app.post("/admin/messages/:id/delete", requireAdmin, (req, res) => {
  const messages = readMessages().filter((m) => m.id !== req.params.id);
  writeMessages(messages);
  res.redirect("/admin");
});

// Express 5 requires a named wildcard, not a bare "*" — the old
// app.get("*", ...) throws at startup and crashes the server.
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`TATTVA running at http://localhost:${PORT}`);
});
