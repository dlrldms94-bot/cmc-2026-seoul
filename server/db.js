const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATA_FILE = path.join(__dirname, "..", "data", "notices.json");

let pool = null;
let useJson = false;

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}

function readJsonSeed() {
  ensureDataFile();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeJsonSeed(list) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function formatIso(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeNotice(item) {
  return {
    id: String(item.id),
    no: Number(item.no) || Number(item.id) || 0,
    titleKo: String(item.titleKo || item.title_ko || "").trim(),
    titleEn: String(item.titleEn || item.title_en || item.titleKo || item.title_ko || "").trim(),
    bodyKo: String(item.bodyKo || item.body_ko || ""),
    bodyEn: String(item.bodyEn || item.body_en || item.bodyKo || item.body_ko || ""),
    pinned: Boolean(item.pinned),
    date: formatDate(item.date),
    createdAt: formatIso(item.createdAt || item.created_at),
    updatedAt: formatIso(item.updatedAt || item.updated_at),
  };
}

function mapNoticeRow(row) {
  return normalizeNotice({
    id: row.id,
    no: row.no,
    titleKo: row.title_ko,
    titleEn: row.title_en,
    bodyKo: row.body_ko,
    bodyEn: row.body_en,
    pinned: row.pinned,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function sortNotices(list) {
  return [...list].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return (b.no || 0) - (a.no || 0);
  });
}

async function seedNoticesIfEmpty() {
  if (useJson) {
    const list = readJsonSeed();
    if (list.length) return;
    return;
  }

  const count = await pool.query("SELECT COUNT(*)::int AS count FROM notices");
  if (count.rows[0].count > 0) return;

  const seed = readJsonSeed()
    .map(normalizeNotice)
    .sort((a, b) => (a.no || 0) - (b.no || 0));

  for (const notice of seed) {
    await pool.query(
      `INSERT INTO notices (
        no, title_ko, title_en, body_ko, body_en, pinned, date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        notice.no,
        notice.titleKo,
        notice.titleEn,
        notice.bodyKo,
        notice.bodyEn,
        notice.pinned,
        notice.date || null,
        notice.createdAt,
        notice.updatedAt,
      ]
    );
  }

  if (seed.length) {
    await pool.query(
      "SELECT setval('notices_id_seq', (SELECT COALESCE(MAX(id), 1) FROM notices))"
    );
  }

  console.log("[db] 초기 공지 시드 완료");
}

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    useJson = true;
    ensureDataFile();
    console.log("[db] DATABASE_URL 없음 — JSON 파일 모드");
    return;
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id SERIAL PRIMARY KEY,
      no INTEGER NOT NULL,
      title_ko TEXT NOT NULL,
      title_en TEXT NOT NULL DEFAULT '',
      body_ko TEXT NOT NULL DEFAULT '',
      body_en TEXT NOT NULL DEFAULT '',
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS archive_photos (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      caption_ko TEXT NOT NULL DEFAULT '',
      caption_en TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      file_data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE archive_photos
    ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'image/jpeg'
  `);
  await pool.query(`
    ALTER TABLE archive_photos
    ADD COLUMN IF NOT EXISTS file_data BYTEA
  `);

  await seedNoticesIfEmpty();
  console.log("[db] PostgreSQL 연결 완료");
}

function isUsingJson() {
  return useJson;
}

async function listNotices() {
  if (useJson) {
    return sortNotices(readJsonSeed().map(normalizeNotice));
  }
  const result = await pool.query(
    "SELECT * FROM notices ORDER BY pinned DESC, no DESC, id DESC"
  );
  return sortNotices(result.rows.map(mapNoticeRow));
}

async function getNotice(id) {
  if (useJson) {
    const item = readJsonSeed().find((n) => String(n.id) === String(id));
    return item ? normalizeNotice(item) : null;
  }
  const result = await pool.query("SELECT * FROM notices WHERE id = $1", [id]);
  return result.rows[0] ? mapNoticeRow(result.rows[0]) : null;
}

async function nextNo() {
  if (useJson) {
    const list = readJsonSeed();
    return list.reduce((max, item) => Math.max(max, Number(item.no) || 0), 0) + 1;
  }
  const result = await pool.query(
    "SELECT COALESCE(MAX(no), 0)::int AS max_no FROM notices"
  );
  return result.rows[0].max_no + 1;
}

async function createNotice(payload) {
  const titleKo = String(payload.titleKo || "").trim();
  const titleEn = String(payload.titleEn || "").trim() || titleKo;
  const bodyKo = String(payload.bodyKo || "").trim();
  const bodyEn = String(payload.bodyEn || "").trim() || bodyKo;
  const pinned = Boolean(payload.pinned);
  const date =
    String(payload.date || "").trim() || new Date().toISOString().slice(0, 10);
  const no = await nextNo();
  const now = new Date().toISOString();

  if (useJson) {
    const list = readJsonSeed();
    const item = normalizeNotice({
      id: `n${no}`,
      no,
      titleKo,
      titleEn,
      bodyKo,
      bodyEn,
      pinned,
      date,
      createdAt: now,
      updatedAt: now,
    });
    list.push(item);
    writeJsonSeed(list);
    return item;
  }

  const result = await pool.query(
    `INSERT INTO notices (
      no, title_ko, title_en, body_ko, body_en, pinned, date, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING *`,
    [no, titleKo, titleEn, bodyKo, bodyEn, pinned, date]
  );
  return mapNoticeRow(result.rows[0]);
}

async function updateNotice(id, payload) {
  const current = await getNotice(id);
  if (!current) return null;

  const titleKo = String(payload.titleKo ?? current.titleKo).trim();
  const titleEn =
    String(payload.titleEn ?? current.titleEn ?? titleKo).trim() || titleKo;
  const bodyKo = String(payload.bodyKo ?? current.bodyKo ?? "").trim();
  const bodyEn =
    String(payload.bodyEn ?? current.bodyEn ?? bodyKo).trim() || bodyKo;
  const pinned =
    payload.pinned === undefined ? Boolean(current.pinned) : Boolean(payload.pinned);
  const date =
    String(payload.date ?? current.date).trim() || current.date;

  if (useJson) {
    const list = readJsonSeed();
    const idx = list.findIndex((n) => String(n.id) === String(id));
    if (idx < 0) return null;
    const updated = normalizeNotice({
      ...list[idx],
      titleKo,
      titleEn,
      bodyKo,
      bodyEn,
      pinned,
      date,
      updatedAt: new Date().toISOString(),
    });
    list[idx] = updated;
    writeJsonSeed(list);
    return updated;
  }

  const result = await pool.query(
    `UPDATE notices
     SET title_ko = $1,
         title_en = $2,
         body_ko = $3,
         body_en = $4,
         pinned = $5,
         date = $6,
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [titleKo, titleEn, bodyKo, bodyEn, pinned, date, id]
  );
  return result.rows[0] ? mapNoticeRow(result.rows[0]) : null;
}

async function deleteNotice(id) {
  if (useJson) {
    const list = readJsonSeed();
    const next = list.filter((n) => String(n.id) !== String(id));
    if (next.length === list.length) return false;
    writeJsonSeed(next);
    return true;
  }
  const result = await pool.query("DELETE FROM notices WHERE id = $1", [id]);
  return result.rowCount > 0;
}

const INQUIRIES_FILE = path.join(__dirname, "..", "data", "inquiries.json");

function ensureInquiriesFile() {
  const dir = path.dirname(INQUIRIES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(INQUIRIES_FILE)) {
    fs.writeFileSync(INQUIRIES_FILE, "[]", "utf8");
  }
}

function readInquiriesJson() {
  ensureInquiriesFile();
  try {
    const data = JSON.parse(fs.readFileSync(INQUIRIES_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeInquiriesJson(list) {
  ensureInquiriesFile();
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2), "utf8");
}

function normalizeInquiry(item) {
  return {
    id: String(item.id),
    name: String(item.name || "").trim(),
    email: String(item.email || "").trim(),
    message: String(item.message || "").trim(),
    createdAt: formatIso(item.createdAt || item.created_at),
  };
}

async function createInquiry(payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  const message = String(payload.message || "").trim();
  const now = new Date().toISOString();

  if (useJson) {
    const list = readInquiriesJson();
    const item = normalizeInquiry({
      id: `i${Date.now()}`,
      name,
      email,
      message,
      createdAt: now,
    });
    list.unshift(item);
    writeInquiriesJson(list);
    return item;
  }

  const result = await pool.query(
    `INSERT INTO inquiries (name, email, message, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, name, email, message, created_at`,
    [name, email, message]
  );
  const row = result.rows[0];
  return normalizeInquiry({
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    created_at: row.created_at,
  });
}

async function listInquiries() {
  if (useJson) {
    return readInquiriesJson().map(normalizeInquiry);
  }
  const result = await pool.query(
    "SELECT id, name, email, message, created_at FROM inquiries ORDER BY id DESC LIMIT 200"
  );
  return result.rows.map((row) =>
    normalizeInquiry({
      id: row.id,
      name: row.name,
      email: row.email,
      message: row.message,
      created_at: row.created_at,
    })
  );
}

const ARCHIVE_PHOTOS_FILE = path.join(
  __dirname,
  "..",
  "data",
  "archive-photos.json"
);

function ensureArchivePhotosFile() {
  const dir = path.dirname(ARCHIVE_PHOTOS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ARCHIVE_PHOTOS_FILE)) {
    fs.writeFileSync(ARCHIVE_PHOTOS_FILE, "[]", "utf8");
  }
}

function readArchivePhotosJson() {
  ensureArchivePhotosFile();
  try {
    const data = JSON.parse(fs.readFileSync(ARCHIVE_PHOTOS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeArchivePhotosJson(list) {
  ensureArchivePhotosFile();
  fs.writeFileSync(ARCHIVE_PHOTOS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function normalizeArchivePhoto(item) {
  return {
    id: String(item.id),
    filename: String(item.filename || "").trim(),
    captionKo: String(item.captionKo || item.caption_ko || "").trim(),
    captionEn: String(item.captionEn || item.caption_en || "").trim(),
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0) || 0,
    createdAt: formatIso(item.createdAt || item.created_at),
  };
}

function mapArchivePhotoRow(row) {
  return normalizeArchivePhoto({
    id: row.id,
    filename: row.filename,
    captionKo: row.caption_ko,
    captionEn: row.caption_en,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  });
}

function sortArchivePhotos(list) {
  return [...list].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

async function listArchivePhotos() {
  if (useJson) {
    return sortArchivePhotos(readArchivePhotosJson().map(normalizeArchivePhoto));
  }
  const result = await pool.query(
    `SELECT id, filename, caption_ko, caption_en, sort_order, mime_type, created_at
     FROM archive_photos ORDER BY sort_order ASC, id DESC`
  );
  return sortArchivePhotos(result.rows.map(mapArchivePhotoRow));
}

async function getArchivePhoto(id) {
  if (useJson) {
    const item = readArchivePhotosJson().find((p) => String(p.id) === String(id));
    return item ? normalizeArchivePhoto(item) : null;
  }
  const result = await pool.query("SELECT * FROM archive_photos WHERE id = $1", [
    id,
  ]);
  return result.rows[0] ? mapArchivePhotoRow(result.rows[0]) : null;
}

async function nextArchiveSortOrder() {
  if (useJson) {
    const list = readArchivePhotosJson();
    return (
      list.reduce(
        (max, item) => Math.max(max, Number(item.sortOrder ?? item.sort_order) || 0),
        0
      ) + 1
    );
  }
  const result = await pool.query(
    "SELECT COALESCE(MAX(sort_order), 0)::int AS max_sort FROM archive_photos"
  );
  return result.rows[0].max_sort + 1;
}

async function createArchivePhoto(payload) {
  const filename = String(payload.filename || "").trim();
  if (!filename) throw new Error("filename is required");
  const captionKo = String(payload.captionKo || "").trim();
  const captionEn = String(payload.captionEn || "").trim() || captionKo;
  const mimeType = String(payload.mimeType || "image/jpeg").trim() || "image/jpeg";
  const fileData = payload.fileData ? Buffer.from(payload.fileData) : null;
  const sortOrder =
    payload.sortOrder !== undefined
      ? Number(payload.sortOrder) || 0
      : await nextArchiveSortOrder();
  const now = new Date().toISOString();

  if (useJson) {
    const list = readArchivePhotosJson();
    const record = {
      id: `a${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      filename,
      captionKo,
      captionEn,
      sortOrder,
      mimeType,
      fileDataBase64: fileData ? fileData.toString("base64") : "",
      createdAt: now,
    };
    list.push(record);
    writeArchivePhotosJson(list);
    return normalizeArchivePhoto(record);
  }

  const result = await pool.query(
    `INSERT INTO archive_photos (
      filename, caption_ko, caption_en, sort_order, mime_type, file_data, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, filename, caption_ko, caption_en, sort_order, mime_type, created_at`,
    [filename, captionKo, captionEn, sortOrder, mimeType, fileData]
  );
  return mapArchivePhotoRow(result.rows[0]);
}

async function getArchivePhotoFile(id) {
  if (useJson) {
    const raw = readArchivePhotosJson().find((p) => String(p.id) === String(id));
    if (!raw) return null;
    const base64 = raw.fileDataBase64 || raw.file_data_base64 || "";
    if (!base64) return null;
    return {
      filename: String(raw.filename || "photo.jpg"),
      mimeType: String(raw.mimeType || raw.mime_type || "image/jpeg"),
      fileData: Buffer.from(base64, "base64"),
    };
  }

  const result = await pool.query(
    "SELECT filename, mime_type, file_data FROM archive_photos WHERE id = $1",
    [id]
  );
  const row = result.rows[0];
  if (!row?.file_data) return null;
  return {
    filename: row.filename,
    mimeType: row.mime_type || "image/jpeg",
    fileData: row.file_data,
  };
}

async function deleteArchivePhoto(id) {
  if (useJson) {
    const list = readArchivePhotosJson();
    const next = list.filter((p) => String(p.id) !== String(id));
    if (next.length === list.length) return null;
    const removed = list.find((p) => String(p.id) === String(id));
    writeArchivePhotosJson(next);
    return removed ? normalizeArchivePhoto(removed) : null;
  }
  const current = await getArchivePhoto(id);
  if (!current) return null;
  await pool.query("DELETE FROM archive_photos WHERE id = $1", [id]);
  return current;
}

module.exports = {
  initDatabase,
  isUsingJson,
  listNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice,
  createInquiry,
  listInquiries,
  listArchivePhotos,
  getArchivePhoto,
  getArchivePhotoFile,
  createArchivePhoto,
  deleteArchivePhoto,
};
