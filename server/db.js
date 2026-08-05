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

module.exports = {
  initDatabase,
  isUsingJson,
  listNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice,
};
