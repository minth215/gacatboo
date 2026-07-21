import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',      -- 'admin' | 'user'
  status        TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 분류 (categories): per user, split by income/expense
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- 'income' | 'expense'
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 원천 (sources): two-level tree. parent_id NULL => top-level (현금/은행/카드/기타)
CREATE TABLE IF NOT EXISTS sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 그룹 (groups)
CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  category    TEXT NOT NULL DEFAULT '기타',  -- 여행/구독/동거/N빵/기타
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  PRIMARY KEY (group_id, user_id)
);

-- 가계부 항목 (transactions)
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- owner ledger (attributed member for group tx)
  group_id      INTEGER REFERENCES groups(id) ON DELETE CASCADE,           -- NULL => personal
  type          TEXT NOT NULL,      -- 'income' | 'expense'
  date          TEXT NOT NULL,      -- 'YYYY-MM-DD'
  amount        INTEGER NOT NULL,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL DEFAULT '',
  source_id     INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  source_name   TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  memo          TEXT NOT NULL DEFAULT '',
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,           -- who authored (group tx)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date  ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_group_date ON transactions(group_id, date);
`);

export const DEFAULT_INCOME_CATEGORIES = ['월급', '부수입', '용돈', '금융소득'];
export const DEFAULT_EXPENSE_CATEGORIES = ['식당', '교통', '쇼핑', '문화생활', '통신', '보험', '병원', '교육', '구독', '기타'];
export const DEFAULT_SOURCES = ['현금', '은행', '카드', '기타'];

// Seed default categories & sources for a newly created user.
export function seedDefaultsForUser(userId) {
  const insCat = db.prepare('INSERT INTO categories (user_id, type, name, sort_order) VALUES (?, ?, ?, ?)');
  DEFAULT_INCOME_CATEGORIES.forEach((name, i) => insCat.run(userId, 'income', name, i));
  DEFAULT_EXPENSE_CATEGORIES.forEach((name, i) => insCat.run(userId, 'expense', name, i));

  const insSrc = db.prepare('INSERT INTO sources (user_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)');
  DEFAULT_SOURCES.forEach((name, i) => insSrc.run(userId, null, name, i));
}

// Bootstrap: create the first admin account if no admin exists.
export function ensureAdmin() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin1234';
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role, status) VALUES (?, ?, ?, 'admin', 'approved')"
    ).run(username, hash, '관리자');
    seedDefaultsForUser(info.lastInsertRowid);
    console.log(`[seed] 기본 관리자 계정 생성: ${username} / ${password}`);
  }
}

export default db;
