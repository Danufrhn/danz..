const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// POST /api/stock/move  { product_id, type: 'in'|'out'|'adjustment', quantity, note, reference }
router.post('/move', (req, res) => {
  const { product_id, type, quantity, note, reference } = req.body;

  if (!product_id || !type || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'product_id, type, dan quantity (>0) wajib diisi.' });
  }
  if (!['in', 'out', 'adjustment'].includes(type)) {
    return res.status(400).json({ error: "type harus 'in', 'out', atau 'adjustment'." });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

  let newStock = product.stock;
  if (type === 'in') newStock += quantity;
  else if (type === 'out') newStock -= quantity;
  else newStock = quantity; // adjustment = set langsung ke angka ini

  if (newStock < 0) {
    return res.status(400).json({ error: `Stok tidak cukup. Sisa stok saat ini: ${product.stock}.` });
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?`).run(
      newStock,
      product_id
    );
    db.prepare(
      `INSERT INTO stock_movements (product_id, type, quantity, stock_after, note, reference, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      product_id,
      type,
      type === 'adjustment' ? Math.abs(newStock - product.stock) : quantity,
      newStock,
      note || null,
      reference || null,
      req.user.id
    );
  });
  tx();

  res.json({ ok: true, stock: newStock });
});

// GET /api/stock/history?product_id=&limit=50
router.get('/history', (req, res) => {
  const { product_id, limit } = req.query;
  let query = `
    SELECT sm.*, p.name AS product_name, p.sku, u.name AS user_name
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    LEFT JOIN users u ON u.id = sm.user_id
    WHERE 1=1
  `;
  const params = [];
  if (product_id) {
    query += ' AND sm.product_id = ?';
    params.push(product_id);
  }
  query += ' ORDER BY sm.created_at DESC LIMIT ?';
  params.push(Number(limit) || 100);

  const history = db.prepare(query).all(...params);
  res.json({ history });
});

// GET /api/stock/summary  (untuk kartu ringkasan dashboard)
router.get('/summary', (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const totalStock = db.prepare('SELECT COALESCE(SUM(stock),0) AS s FROM products').get().s;
  const lowStock = db
    .prepare('SELECT COUNT(*) AS c FROM products WHERE stock <= min_stock')
    .get().c;
  const todayMovements = db
    .prepare(
      `SELECT COUNT(*) AS c FROM stock_movements WHERE date(created_at) = date('now')`
    )
    .get().c;

  res.json({ totalProducts, totalStock, lowStock, todayMovements });
});

module.exports = router;
