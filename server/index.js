const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const db = require("./db");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cmc2026admin";
const SESSION_SECRET = process.env.SESSION_SECRET || "cmc-dev-secret-change-me";
const COOKIE_NAME = "cmc_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const sessions = new Map();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(SESSION_SECRET));

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isAuthed(req) {
  const token = req.signedCookies?.[COOKIE_NAME] || req.cookies?.[COOKIE_NAME];
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function requireAdmin(req, res, next) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function handleAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get(
  "/api/health",
  handleAsync(async (_req, res) => {
    res.json({
      ok: true,
      db: db.isUsingJson() ? "json" : "postgresql",
    });
  })
);

app.get(
  "/api/notices",
  handleAsync(async (_req, res) => {
    const list = await db.listNotices();
    res.json(list);
  })
);

app.get(
  "/api/notices/:id",
  handleAsync(async (req, res) => {
    const item = await db.getNotice(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  })
);

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  const token = createSession();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = req.signedCookies?.[COOKIE_NAME] || req.cookies?.[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  res.json({ authenticated: isAuthed(req) });
});

const INQUIRY_TO = process.env.INQUIRY_TO || "2026CMCSEOUL@gmail.com";

app.post(
  "/api/inquiry",
  handleAsync(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const message = String(req.body?.message || "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const subject = `[CMC 문의] ${name}`;
    const body = `이름: ${name}\n회신 받을 메일: ${email}\n\n${message}`;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: INQUIRY_TO,
          replyTo: email,
          subject,
          text: body,
        });
        return res.json({ ok: true, sent: true });
      } catch (err) {
        console.error("[inquiry] SMTP send failed", err);
      }
    }

    const mailto = `mailto:${INQUIRY_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    res.json({ ok: true, sent: false, mailto });
  })
);

app.post(
  "/api/notices",
  requireAdmin,
  handleAsync(async (req, res) => {
    const titleKo = String(req.body?.titleKo || "").trim();
    if (!titleKo) {
      return res.status(400).json({ error: "titleKo is required" });
    }
    const item = await db.createNotice({
      titleKo,
      titleEn: String(req.body?.titleEn || "").trim(),
      bodyKo: String(req.body?.bodyKo || "").trim(),
      bodyEn: String(req.body?.bodyEn || "").trim(),
      pinned: Boolean(req.body?.pinned),
      date: String(req.body?.date || "").trim(),
    });
    res.status(201).json(item);
  })
);

app.put(
  "/api/notices/:id",
  requireAdmin,
  handleAsync(async (req, res) => {
    const titleKo = String(req.body?.titleKo || "").trim();
    if (req.body?.titleKo !== undefined && !titleKo) {
      return res.status(400).json({ error: "titleKo is required" });
    }
    const item = await db.updateNotice(req.params.id, {
      titleKo: req.body?.titleKo,
      titleEn: req.body?.titleEn,
      bodyKo: req.body?.bodyKo,
      bodyEn: req.body?.bodyEn,
      pinned: req.body?.pinned,
      date: req.body?.date,
    });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  })
);

app.delete(
  "/api/notices/:id",
  requireAdmin,
  handleAsync(async (req, res) => {
    const ok = await db.deleteNotice(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  })
);

app.use(express.static(ROOT));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  const filePath = path.join(ROOT, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  if (req.path.endsWith("/") || !path.extname(req.path)) {
    const indexPath = path.join(filePath, "index.html");
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  }
  res.status(404).send("Not found");
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

async function start() {
  await db.initDatabase();
  app.listen(PORT, () => {
    console.log(`CMC server running on http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin/`);
    console.log(`DB mode: ${db.isUsingJson() ? "json" : "postgresql"}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
