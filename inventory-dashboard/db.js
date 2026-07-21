const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'inventory.db'));
db.pragma('journal_mode = WAL');

// ---- Schema ----
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'pcs',
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  price INTEGER DEFAULT 0,
  shopee_item_id TEXT,      -- id produk di Shopee, diisi setelah link
  shopee_model_id TEXT,     -- untuk produk dengan varian
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,        -- 'in' | 'out' | 'adjustment' | 'shopee_sync'
  quantity INTEGER NOT NULL, -- selalu positif; arah ditentukan oleh 'type'
  stock_after INTEGER NOT NULL,
  note TEXT,
  reference TEXT,            -- no. PO / no. pesanan Shopee / dsb
  user_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopee_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  partner_id TEXT,
  partner_key TEXT,
  shop_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  connected INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

// Seed default admin if no users exist
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run('Admin', 'admin@toko.com', hash, 'admin');
  console.log('>> User admin default dibuat: admin@toko.com / admin123 (segera ganti password!)');
}

// Seed empty shopee_config row
const cfgCount = db.prepare('SELECT COUNT(*) AS c FROM shopee_config').get().c;
if (cfgCount === 0) {
  db.prepare('INSERT INTO shopee_config (id, connected) VALUES (1, 0)').run();
}

module.exports = db;
