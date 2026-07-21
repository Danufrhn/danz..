const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const HOST = process.env.SHOPEE_SANDBOX === 'true'
  ? 'https://partner.test-stable.shopeemobile.com'
  : 'https://partner.shopeemobile.com';

function getConfig() {
  return db.prepare('SELECT * FROM shopee_config WHERE id = 1').get();
}

// Bikin tanda tangan (HMAC-SHA256) sesuai spesifikasi Shopee Open Platform v2
function sign(path, partnerId, partnerKey, timestamp, accessToken = '', shopId = '') {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

// GET /api/shopee/status — cek apakah sudah terhubung
router.get('/status', requireAuth, (req, res) => {
  const cfg = getConfig();
  res.json({
    connected: !!cfg.connected,
    shop_id: cfg.shop_id || null,
    updated_at: cfg.updated_at,
  });
});

// GET /api/shopee/auth-url — admin generate link untuk authorize toko
// Butuh SHOPEE_PARTNER_ID & SHOPEE_PARTNER_KEY di .env, dan SHOPEE_REDIRECT_URL
router.get('/auth-url', requireAuth, requireAdmin, (req, res) => {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const redirectUrl = process.env.SHOPEE_REDIRECT_URL;

  if (!partnerId || !partnerKey || !redirectUrl) {
    return res.status(400).json({
      error:
        'SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, dan SHOPEE_REDIRECT_URL belum diisi di file .env.',
    });
  }

  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(path, partnerId, partnerKey, timestamp);

  const url = `${HOST}${path}?partner_id=${partnerId}&redirect=${encodeURIComponent(
    redirectUrl
  )}&timestamp=${timestamp}&sign=${signature}`;

  res.json({ url });
});

// GET /api/shopee/callback — Shopee redirect ke sini setelah seller approve
// Query: code, shop_id
router.get('/callback', async (req, res) => {
  const { code, shop_id } = req.query;
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;

  if (!code || !shop_id) {
    return res.status(400).send('Parameter code / shop_id tidak ditemukan dari Shopee.');
  }

  try {
    const path = '/api/v2/auth/token/get';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(path, partnerId, partnerKey, timestamp);

    const { data } = await axios.post(
      `${HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`,
      { code, shop_id: Number(shop_id), partner_id: Number(partnerId) }
    );

    if (data.error) {
      return res.status(400).send(`Gagal menghubungkan toko: ${data.message}`);
    }

    db.prepare(
      `UPDATE shopee_config SET shop_id = ?, access_token = ?, refresh_token = ?, connected = 1, updated_at = datetime('now') WHERE id = 1`
    ).run(String(shop_id), data.access_token, data.refresh_token);

    res.send('<h2>Toko Shopee berhasil terhubung! Anda boleh menutup tab ini dan kembali ke dashboard.</h2>');
  } catch (err) {
    res.status(500).send(`Terjadi kesalahan saat menghubungkan toko: ${err.message}`);
  }
});

// POST /api/shopee/pull-stock — tarik daftar produk & stok dari Shopee, cocokkan dengan SKU lokal
router.post('/pull-stock', requireAuth, requireAdmin, async (req, res) => {
  const cfg = getConfig();
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;

  if (!cfg.connected) {
    return res.status(400).json({ error: 'Toko Shopee belum terhubung. Hubungkan dulu lewat menu Sinkron Shopee.' });
  }

  try {
    // 1. Ambil daftar item
    const listPath = '/api/v2/product/get_item_list';
    let timestamp = Math.floor(Date.now() / 1000);
    let signature = sign(listPath, partnerId, partnerKey, timestamp, cfg.access_token, cfg.shop_id);

    const { data: listData } = await axios.get(`${HOST}${listPath}`, {
      params: {
        partner_id: partnerId,
        timestamp,
        sign: signature,
        shop_id: cfg.shop_id,
        access_token: cfg.access_token,
        offset: 0,
        page_size: 100,
        item_status: 'NORMAL',
      },
    });

    const itemIds = (listData.response?.item || []).map((i) => i.item_id);
    if (itemIds.length === 0) {
      return res.json({ ok: true, updated: 0, message: 'Tidak ada produk ditemukan di toko Shopee.' });
    }

    // 2. Ambil detail stok tiap item
    const basePath = '/api/v2/product/get_item_base_info';
    timestamp = Math.floor(Date.now() / 1000);
    signature = sign(basePath, partnerId, partnerKey, timestamp, cfg.access_token, cfg.shop_id);

    const { data: baseData } = await axios.get(`${HOST}${basePath}`, {
      params: {
        partner_id: partnerId,
        timestamp,
        sign: signature,
        shop_id: cfg.shop_id,
        access_token: cfg.access_token,
        item_id_list: itemIds.join(','),
      },
    });

    let updated = 0;
    const tx = db.transaction(() => {
      for (const item of baseData.response?.item_list || []) {
        const skuLocal = item.item_sku;
        if (!skuLocal) continue;
        const product = db.prepare('SELECT * FROM products WHERE sku = ?').get(skuLocal);
        if (!product) continue;

        const shopeeStock = item.stock_info_v2?.summary_info?.total_available_stock ?? null;
        if (shopeeStock === null || shopeeStock === product.stock) continue;

        db.prepare(
          `UPDATE products SET stock = ?, shopee_item_id = ?, last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
        ).run(shopeeStock, String(item.item_id), product.id);

        db.prepare(
          `INSERT INTO stock_movements (product_id, type, quantity, stock_after, note, reference, user_id)
           VALUES (?, 'shopee_sync', ?, ?, 'Sinkron otomatis dari Shopee', ?, ?)`
        ).run(product.id, Math.abs(shopeeStock - product.stock), shopeeStock, `item_id:${item.item_id}`, req.user.id);

        updated++;
      }
    });
    tx();

    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: `Gagal menarik data dari Shopee: ${err.message}` });
  }
});

// POST /api/shopee/push-stock/:productId — kirim update stok lokal ke Shopee
router.post('/push-stock/:productId', requireAuth, async (req, res) => {
  const cfg = getConfig();
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;

  if (!cfg.connected) {
    return res.status(400).json({ error: 'Toko Shopee belum terhubung.' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  if (!product.shopee_item_id) {
    return res.status(400).json({ error: 'Produk ini belum terhubung ke item Shopee manapun (jalankan Tarik Stok dulu).' });
  }

  try {
    const path = '/api/v2/product/update_stock';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(path, partnerId, partnerKey, timestamp, cfg.access_token, cfg.shop_id);

    const { data } = await axios.post(
      `${HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}&shop_id=${cfg.shop_id}&access_token=${cfg.access_token}`,
      {
        item_id: Number(product.shopee_item_id),
        stock_list: [{ model_id: 0, seller_stock: [{ stock: product.stock }] }],
      }
    );

    if (data.error) return res.status(400).json({ error: data.message });

    db.prepare(`UPDATE products SET last_synced_at = datetime('now') WHERE id = ?`).run(product.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Gagal mengirim stok ke Shopee: ${err.message}` });
  }
});

module.exports = router;
