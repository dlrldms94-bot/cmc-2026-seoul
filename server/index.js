const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const db = require("./db");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cmc2026admin";
const ARCHIVE_PASSWORD = process.env.ARCHIVE_PASSWORD || "cmc2026archive";
const SESSION_SECRET = process.env.SESSION_SECRET || "cmc-dev-secret-change-me";
const COOKIE_NAME = "cmc_admin";
const ARCHIVE_COOKIE_NAME = "cmc_archive";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const ARCHIVE_UPLOAD_DIR = path.join(ROOT, "data", "archive", "photos");

const sessions = new Map();
const archiveSessions = new Map();

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

function createArchiveSession() {
  const token = crypto.randomBytes(32).toString("hex");
  archiveSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isArchiveAuthed(req) {
  const token =
    req.signedCookies?.[ARCHIVE_COOKIE_NAME] || req.cookies?.[ARCHIVE_COOKIE_NAME];
  if (!token) return false;
  const expires = archiveSessions.get(token);
  if (!expires || expires < Date.now()) {
    archiveSessions.delete(token);
    return false;
  }
  archiveSessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function requireArchiveAuth(req, res, next) {
  if (!isArchiveAuthed(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function requireArchiveOrAdmin(req, res, next) {
  if (isArchiveAuthed(req) || isAuthed(req)) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

function ensureArchiveUploadDir() {
  if (!fs.existsSync(ARCHIVE_UPLOAD_DIR)) {
    fs.mkdirSync(ARCHIVE_UPLOAD_DIR, { recursive: true });
  }
}

ensureArchiveUploadDir();

const archiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 24 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Images only"));
    }
  },
});

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

app.post("/api/archive/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== ARCHIVE_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  const token = createArchiveSession();
  res.cookie(ARCHIVE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

app.post("/api/archive/logout", (req, res) => {
  const token =
    req.signedCookies?.[ARCHIVE_COOKIE_NAME] || req.cookies?.[ARCHIVE_COOKIE_NAME];
  if (token) archiveSessions.delete(token);
  res.clearCookie(ARCHIVE_COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/archive/me", (req, res) => {
  res.json({ authenticated: isArchiveAuthed(req) });
});

function mapArchivePhotoUrls(list) {
  return list.map((item) => ({
    ...item,
    url: `/api/archive/photos/${encodeURIComponent(item.id)}/file`,
  }));
}

async function sendArchivePhotoFile(req, res) {
  const file = await db.getArchivePhotoFile(req.params.id);
  if (file?.fileData?.length) {
    res.set("Content-Type", file.mimeType || "image/jpeg");
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(file.fileData);
  }

  const meta = await db.getArchivePhoto(req.params.id);
  if (meta?.filename) {
    const filePath = path.join(ARCHIVE_UPLOAD_DIR, meta.filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  return res.status(404).send("Not found");
}

app.get(
  "/api/archive/photos",
  requireArchiveAuth,
  handleAsync(async (_req, res) => {
    const list = await db.listArchivePhotos();
    res.json(mapArchivePhotoUrls(list));
  })
);

app.get(
  "/api/archive/photos/admin",
  requireAdmin,
  handleAsync(async (_req, res) => {
    const list = await db.listArchivePhotos();
    res.json(mapArchivePhotoUrls(list));
  })
);

app.get(
  "/api/archive/photos/:id/file",
  requireArchiveOrAdmin,
  handleAsync(async (req, res) => sendArchivePhotoFile(req, res))
);

app.post(
  "/api/archive/photos",
  requireAdmin,
  archiveUpload.array("photos", 24),
  handleAsync(async (req, res) => {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "No photos uploaded" });
    }
    const captionKo = String(req.body?.captionKo || "").trim();
    const captionEn = String(req.body?.captionEn || "").trim();
    const created = [];
    for (const file of files) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
        ? ext
        : ".jpg";
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`;
      const item = await db.createArchivePhoto({
        filename,
        captionKo,
        captionEn: captionEn || captionKo,
        mimeType: file.mimetype || "image/jpeg",
        fileData: file.buffer,
      });
      created.push(...mapArchivePhotoUrls([item]));
    }
    res.status(201).json(created);
  })
);

app.delete(
  "/api/archive/photos/:id",
  requireAdmin,
  handleAsync(async (req, res) => {
    const removed = await db.deleteArchivePhoto(req.params.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    const filePath = path.join(ARCHIVE_UPLOAD_DIR, removed.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error("[archive] failed to delete file", err);
      }
    }
    res.json({ ok: true });
  })
);

app.use(
  "/uploads/archive",
  (req, res, next) => {
    if (!isArchiveAuthed(req) && !isAuthed(req)) {
      return res.status(401).send("Unauthorized");
    }
    next();
  },
  express.static(ARCHIVE_UPLOAD_DIR, { maxAge: "1h" })
);

const INQUIRY_TO = process.env.INQUIRY_TO || "2026CMCSEOUL@gmail.com";

async function trySendSmtp({ name, email, message }) {
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  const smtpPass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!smtpUser || !smtpPass) return false;

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: `"CMC SEOUL" <${smtpUser}>`,
    to: INQUIRY_TO,
    replyTo: email,
    subject: `[CMC 문의] ${name}`,
    text: `이름: ${name}\n회신 받을 메일: ${email}\n\n${message}`,
  });
  return true;
}

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

    // Persist first so inquiries are never lost if mail fails.
    const saved = await db.createInquiry({ name, email, message });

    // Best-effort SMTP in background — never block the response
    // (Render free often hangs on outbound SMTP ports).
    trySendSmtp({ name, email, message }).catch((err) => {
      console.error("[inquiry] SMTP send failed", err?.message || err);
    });

    return res.json({
      ok: true,
      saved: true,
      id: saved.id,
    });
  })
);

app.get(
  "/api/inquiries",
  requireAdmin,
  handleAsync(async (_req, res) => {
    const list = await db.listInquiries();
    res.json(list);
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
  if (err?.name === "MulterError" || err?.message === "Images only") {
    return res.status(400).json({ error: err.message || "Upload failed" });
  }
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
