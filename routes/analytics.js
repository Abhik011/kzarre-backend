const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// MODELS - adjust paths if your models are in a different folder
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Traffic = require('../models/Traffic');
const Product = require('../models/product');

// Optional libs - try to require, but gracefully degrade if not installed
let geoip = null;
let UAParser = null;
try { geoip = require('geoip-lite'); } catch (e) { console.warn('Optional package geoip-lite not installed. Run `npm i geoip-lite` for IP -> geo enrichment.'); }
try { UAParser = require('ua-parser-js'); } catch (e) { console.warn('Optional package ua-parser-js not installed. Run `npm i ua-parser-js` for UA parsing.'); }

// Utility: safe ObjectId for lookups
const toObjectId = id => {
  try { return mongoose.Types.ObjectId(id); } catch (e) { return id; }
};

/* ==================================================
   Helper: Enrich Traffic doc using IP and userAgent
   - Adds: country, region, city, deviceType
   - Use this when creating Traffic entries for more useful analytics
   ================================================== */
async function enrichAndSaveTraffic({ ip, userAgent, extra = {} }) {
  const doc = { ip, userAgent, ...extra };

  if (geoip) {
    try {
      const geo = geoip.lookup(ip || '');
      if (geo) {
        // geo contains: country, region, city, ll, metro, area
        doc.country = geo.country || 'Unknown';
        doc.region = geo.region || 'Unknown';
        doc.city = geo.city || 'Unknown';
      }
    } catch (err) {
      console.warn('geoip lookup failed', err.message || err);
    }
  }

  if (UAParser) {
    try {
      const parser = new UAParser(userAgent || '');
      const os = parser.getOS();
      const device = parser.getDevice();
      const browser = parser.getBrowser();

      // Simplified device type: mobile, tablet, desktop
      let deviceType = 'desktop';
      const uaDevice = device.type || '';
      if (uaDevice === 'mobile') deviceType = 'mobile';
      else if (uaDevice === 'tablet') deviceType = 'tablet';

      doc.deviceType = deviceType;
      doc.os = os.name || null;
      doc.browser = browser.name || null;
    } catch (err) {
      console.warn('UAParser failed', err.message || err);
    }
  }

  // Save doc
  const traffic = new Traffic(doc);
  await traffic.save();
  return traffic;
}

router.get("/track", async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.headers["cf-connecting-ip"] ||
      req.socket.remoteAddress;

    const userAgent = req.headers["user-agent"] || "Unknown";

    await enrichAndSaveTraffic({ ip, userAgent });

    res.json({ success: true });
  } catch (err) {
    console.error("Track Error:", err);
    res.status(500).json({ success: false });
  }
});

router.post("/track", async (req, res) => {
  try {
    // 1. Detect visitor IP
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.headers["cf-connecting-ip"] ||
      req.socket.remoteAddress ||
      null;

    const userAgent = req.headers["user-agent"] || "Unknown";

    // 2. Save traffic entry with geo + device analysis
    await enrichAndSaveTraffic({ ip, userAgent });

    res.json({ success: true });
  } catch (err) {
    console.error("Track Error:", err);
    res.status(500).json({ success: false, message: "Failed to track visit" });
  }
});

router.get('/summary', async (req, res) => {
  try {
    // ✅ Only PAID orders count
    const revenueAgg = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid" // 🔥 REQUIRED
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }, // 🔥 CORRECT FIELD
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await Customer.countDocuments();

    const newUsers = await Customer.countDocuments({
      createdAt: {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      success: true,
      summary: {
        totalRevenue: revenueAgg[0]?.totalRevenue || 0,
        totalOrders: revenueAgg[0]?.totalOrders || 0,
        totalUsers,
        newUsers
      }
    });
  } catch (err) {
    console.error('Summary Error:', err);
    res.status(500).json({
      success: false,
      message: 'Analytics summary failed'
    });
  }
});


router.get('/traffic/daily', async (req, res) => {
  try {
    const analytics = await Traffic.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, visits: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, traffic: analytics });
  } catch (e) {
    console.error('Traffic Error:', e);
    res.status(500).json({ success: false, message: 'Traffic failed' });
  }
});

router.get('/traffic/hourly', async (req, res) => {
  try {
    const analytics = await Traffic.aggregate([
      { $group: { _id: { $hour: '$createdAt' }, visits: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    // normalize to array of 24 hours for frontend convenience
    const hours = Array.from({ length: 24 }).map((_, i) => {
      const item = analytics.find(a => a._id === i);
      return { hour: i, visits: item ? item.visits : 0 };
    });

    res.json({ success: true, data: hours });
  } catch (err) {
    console.error('Hourly Traffic Error:', err);
    res.status(500).json({ success: false, message: 'Hourly traffic failed' });
  }
});


router.get('/traffic/country', async (req, res) => {
  try {
    const analytics = await Traffic.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$country', 'UN'] }, // ISO like IN, US
          visitors: { $sum: 1 }
        }
      },
      { $sort: { visitors: -1 } }
    ]);

    // ✅ ISO → Full Name Map
    const ISO_TO_NAME = {
      IN: "India",
      US: "United States",
      GB: "United Kingdom",
      CA: "Canada",
      AU: "Australia",
      DE: "Germany",
      FR: "France",
      AE: "United Arab Emirates",
      SG: "Singapore",
      PK: "Pakistan",
      BD: "Bangladesh",
      CN: "China",
      JP: "Japan",
      IT: "Italy",
      ES: "Spain",
      BR: "Brazil",
      RU: "Russia",
      TR: "Turkey",
      SA: "Saudi Arabia",
      UN: "Unknown"
    };

    // ✅ FORMAT EXACTLY AS FRONTEND EXPECTS
    const formatted = analytics.map((c) => ({
      country: ISO_TO_NAME[c._id] || "Unknown",
      code: c._id || "",
      visitors: c.visitors || 0
    }));

    res.json({ success: true, countries: formatted });
  } catch (err) {
    console.error('Country Traffic Error:', err);
    res.status(500).json({ success: false, message: 'Country traffic failed' });
  }
});


router.get('/traffic/region', async (req, res) => {
  try {
    const analytics = await Traffic.aggregate([
      { $group: { _id: { country: { $ifNull: ['$country', 'Unknown'] }, region: { $ifNull: ['$region', 'Unknown'] } }, visits: { $sum: 1 } } },
      { $sort: { visits: -1 } }
    ]);

    res.json({ success: true, regions: analytics });
  } catch (err) {
    console.error('Region Traffic Error:', err);
    res.status(500).json({ success: false, message: 'Region traffic failed' });
  }
});

router.get('/traffic/devices', async (req, res) => {
  try {
    const analytics = await Traffic.aggregate([
      { $group: { _id: { $ifNull: ['$deviceType', 'unknown'] }, visits: { $sum: 1 } } }
    ]);
    res.json({ success: true, devices: analytics });
  } catch (err) {
    console.error('Device Traffic Error:', err);
    res.status(500).json({ success: false, message: 'Device analytics failed' });
  }
});


router.get('/conversion-rate', async (req, res) => {
  try {
    const totalVisitors = await Traffic.countDocuments();
    const totalOrders = await Order.countDocuments();
    const rate = totalVisitors === 0 ? 0 : (totalOrders / totalVisitors) * 100;

    res.json({ success: true, visitors: totalVisitors, orders: totalOrders, conversionRate: Number(rate.toFixed(2)) });
  } catch (err) {
    console.error('Conversion Rate Error:', err);
    res.status(500).json({ success: false, message: 'Conversion rate failed' });
  }
});

// ---------------------------
// REPEAT CUSTOMERS
// ---------------------------
router.get('/repeat-customers', async (req, res) => {
  try {
    const repeatCustomersAgg = await Order.aggregate([
      { $group: { _id: '$customerId', orders: { $sum: 1 } } },
      { $match: { orders: { $gte: 2 } } }
    ]);

    res.json({ success: true, repeatCustomers: repeatCustomersAgg.length });
  } catch (err) {
    console.error('Repeat Customer Error:', err);
    res.status(500).json({ success: false, message: 'Repeat customer failed' });
  }
});

// ---------------------------
// ORDERS DAILY
// ---------------------------
router.get('/orders/daily', async (req, res) => {
  try {
    const orders = await Order.aggregate([
      {
        $match: { paymentStatus: "paid" }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          total: { $sum: 1 },
          revenue: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, orders });
  } catch (err) {
    console.error('Orders daily error:', err);
    res.status(500).json({ success: false, message: 'Daily orders failed' });
  }
});


// ---------------------------
// TOP 5 SELLING PRODUCTS
// ---------------------------
router.get('/top-products', async (req, res) => {
  try {
    const products = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', sold: { $sum: '$items.quantity' } } },
      { $sort: { sold: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { _id: 1, sold: 1, name: '$product.name', category: '$product.category', sku: '$product.sku' } }
    ]);

    res.json({ success: true, products });
  } catch (err) {
    console.error('Top products error:', err);
    res.status(500).json({ success: false, message: 'Top products failed' });
  }
});

// ---------------------------
// CATEGORY SALES REPORT
// ---------------------------
router.get('/category-sales', async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.category', total: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $sort: { total: -1 } }
    ]);

    res.json({ success: true, data });
  } catch (err) {
    console.error('Category sales error:', err);
    res.status(500).json({ success: false, message: 'Category sales failed' });
  }
});

/* ==================================================
   HELPER ADMIN ENDPOINTS
   - Enrich existing Traffic documents in batches
   - Note: These endpoints can be heavy on large collections; consider running offline or with pagination.
   ================================================== */

// Enrich a single traffic doc by id (useful for testing)
router.post('/traffic/enrich/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Traffic.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Traffic doc not found' });

    const enriched = await enrichAndSaveTraffic({ ip: doc.ip, userAgent: doc.userAgent, extra: {} });
    // Replace original doc with enriched fields (keeping original createdAt)
    doc.country = enriched.country || doc.country;
    doc.region = enriched.region || doc.region;
    doc.city = enriched.city || doc.city;
    doc.deviceType = enriched.deviceType || doc.deviceType;
    doc.os = enriched.os || doc.os;
    doc.browser = enriched.browser || doc.browser;
    await doc.save();

    res.json({ success: true, doc });
  } catch (err) {
    console.error('Enrich single traffic error:', err);
    res.status(500).json({ success: false, message: 'Enrich failed' });
  }
});

// Batch enrich - processes `limit` docs starting from `skip` (admin-only recommended)
router.post('/traffic/enrich-batch', async (req, res) => {
  try {
    const { skip = 0, limit = 100 } = req.body || {};
    const docs = await Traffic.find().skip(Number(skip)).limit(Number(limit));
    let enrichedCount = 0;

    for (const doc of docs) {
      const enriched = await enrichAndSaveTraffic({ ip: doc.ip, userAgent: doc.userAgent, extra: {} });
      doc.country = enriched.country || doc.country;
      doc.region = enriched.region || doc.region;
      doc.city = enriched.city || doc.city;
      doc.deviceType = enriched.deviceType || doc.deviceType;
      doc.os = enriched.os || doc.os;
      doc.browser = enriched.browser || doc.browser;
      await doc.save();
      enrichedCount++;
    }

    res.json({ success: true, enrichedCount });
  } catch (err) {
    console.error('Batch enrich error:', err);
    res.status(500).json({ success: false, message: 'Batch enrich failed' });
  }
});

/* ==================================================
   Small utility endpoints that frontend may find handy
   ================================================== */

// Average Order Value (AOV)
router.get('/aov', async (req, res) => {
  try {
    const agg = await Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          orders: { $sum: 1 }
        }
      }
    ]);
    const totalRevenue = agg[0]?.totalRevenue || 0;
    const orders = agg[0]?.orders || 0;
    const aov = orders === 0 ? 0 : totalRevenue / orders;
    res.json({ success: true, aov: Number(aov.toFixed(2)), totalRevenue, orders });
  } catch (err) {
    console.error('AOV error:', err);
    res.status(500).json({ success: false, message: 'AOV failed' });
  }
});

// Best revenue-generating regions
router.get('/revenue-by-region', async (req, res) => {
  try {
    const agg = await Order.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      // assuming order has shipping or billing address with country/region referenced on Order
      { $group: { _id: '$shipping.country', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } }
    ]);

    res.json({ success: true, data: agg });
  } catch (err) {
    console.error('Revenue by region error:', err);
    res.status(500).json({ success: false, message: 'Revenue by region failed' });
  }
});

router.get("/users/type", async (req, res) => {
  try {
    const newUsers = await Customer.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    const totalUsers = await Customer.countDocuments();

    res.json({
      success: true,
      newUsers,
      returningUsers: totalUsers - newUsers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "User type failed" });
  }
});

/* ==================================================
   EXPORT ROUTER
   ================================================== */
module.exports = router;
