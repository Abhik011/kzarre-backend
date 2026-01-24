const express = require("express");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const Address = require("../models/Address");
const CustomerPromise = require("../models/CRMPromise");
const CRMNote = require("../models/CRMNote");

const router = express.Router();
// GET /api/crm/default-customer
router.get("/default-customer", async (req, res) => {
  const customer = await Customer.findOne().sort({ updatedAt: -1 }); // latest
  if (!customer) return res.status(404).json({ message: "No customer" });
  res.json(customer);
});
// GET /api/crm/customers
router.get("/customers", async (req, res) => {
  try {
    // ============================
    // 1. LOAD BASIC CUSTOMERS
    // ============================
    const customers = await Customer.find()
      .select("name email phone")
      .limit(50)
      .sort({ updatedAt: -1 });

    const customerIds = customers.map(c => c._id);

    // ============================
    // 2. PROMISE BREACH LOGIC (UNCHANGED)
    // ============================
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(24, 0, 0, 0); // today 24:00 = tomorrow 00:00

    const promises = await CustomerPromise.aggregate([
      {
        $match: {
          customer: { $in: customerIds },
        },
      },

      // 🔥 ALWAYS sort latest first
      { $sort: { createdAt: -1 } },

      // 🔥 Compute effectiveStatus
      {
        $addFields: {
          effectiveStatus: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "pending"] },
                  { $lt: ["$dueDate", startOfTomorrow] },
                ],
              },
              "breached",
              "$status",
            ],
          },
        },
      },

      // 🔥 Group per customer
      {
        $group: {
          _id: "$customer",

          // Latest promise only
          lastCreatedAt: { $first: "$createdAt" },
          lastDueDate: { $first: "$dueDate" },

          // 🔴 LAST STATUS
          lastStatus: { $first: "$effectiveStatus" },

          pendingCount: {
            $sum: {
              $cond: [{ $eq: ["$effectiveStatus", "pending"] }, 1, 0],
            },
          },

          breachedCount: {
            $sum: {
              $cond: [{ $eq: ["$effectiveStatus", "breached"] }, 1, 0],
            },
          },

          fulfilledCount: {
            $sum: {
              $cond: [{ $eq: ["$effectiveStatus", "fulfilled"] }, 1, 0],
            },
          },
        },
      },
    ]);

    // ============================
    // 3. BUILD PROMISE MAP (UNCHANGED)
    // ============================
    const promiseMap = {};
    promises.forEach(p => {
      promiseMap[p._id.toString()] = {
        lastPromiseCreatedAt: p.lastCreatedAt,
        lastPromiseDueDate: p.lastDueDate,
        lastPromiseStatus: p.lastStatus,
        pendingCount: p.pendingCount,
        breachedCount: p.breachedCount,
        fulfilledCount: p.fulfilledCount,
      };
    });

    // ============================
    // 4. ADD METRICS SAFELY (NEW)
    // ============================
    const enriched = [];

    for (const c of customers) {
      // 🔥 Load orders for this customer
      const orders = await Order.find({ userId: c._id });

      const delivered = orders.filter(o => o.status === "delivered");
      const cancelled = orders.filter(o => o.status === "cancelled");

      const ltv = delivered.reduce((sum, o) => sum + (o.amount || 0), 0);
      const aov = delivered.length > 0 ? Math.round(ltv / delivered.length) : 0;
      const returnRate =
        orders.length > 0
          ? Math.round((cancelled.length / orders.length) * 100)
          : 0;

      const p = promiseMap[c._id.toString()];

      enriched.push({
        ...c.toObject(),

        // ✅ METRICS ADDED (NEW, SAFE)
        metrics: {
          ltv: ltv || 0,
          aov: aov || 0,
          returnRate: returnRate || 0,
        },

        // ✅ PROMISE FIELDS (UNCHANGED)
        lastPromiseCreatedAt: p?.lastPromiseCreatedAt || null,
        lastPromiseDueDate: p?.lastPromiseDueDate || null,
        lastPromiseStatus: p?.lastPromiseStatus || null,

        pendingCount: p?.pendingCount || 0,
        breachedCount: p?.breachedCount || 0,
        fulfilledCount: p?.fulfilledCount || 0,
      });
    }

    // ============================
    // 5. SEND RESPONSE
    // ============================
    res.json(enriched);
  } catch (err) {
    console.error("FETCH CUSTOMERS ERROR:", err);
    res.status(500).json([]);
  }
});




router.post("/notes/create", async (req, res) => {
  try {
    const { customerId, message } = req.body;

    if (!customerId || !message)
      return res.status(400).json({ message: "Missing fields" });

    const note = await CRMNote.create({
      customerId,
      message,
      createdBy: "Admin",
    });

    res.json(note);
  } catch (err) {
    res.status(500).json({ message: "Failed to create note" });
  }
});
/* ================================
   ✅ GET NOTES BY CUSTOMER
================================ */
router.get("/notes/:customerId", async (req, res) => {
  try {
    const notes = await CRMNote.find({
      customerId: req.params.customerId,
    }).sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch notes" });
  }
});

router.post("/promises/create", async (req, res) => {
  try {
    const { customerId, type, dueDate, notes, attachmentUrl } = req.body;

    if (!customerId || !type || !dueDate)
      return res.status(400).json({ message: "Missing required fields" });

    const promise = await CustomerPromise.create({
      customer: customerId,
      type,
      dueDate,
      notes,
      attachmentUrl,
      createdBy: req.user?.id || null, // attach admin if auth middleware exists
    });

    res.json({ success: true, promise });
  } catch (err) {
    console.error("PROMISE CREATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/promises/:customerId", async (req, res) => {
  try {
    const promises = await CustomerPromise.find({
      customer: req.params.customerId,
    }).sort({ createdAt: -1 });

    res.json(promises);
  } catch (err) {
    console.error("PROMISE FETCH ERROR:", err);
    res.status(500).json([]);
  }
});

router.get("/search", async (req, res) => {
  try {
    const { email, phone, orderId } = req.query;

    let customer = null;

    // ✅ 1. SEARCH BY ORDER ID
    // ✅ 1. SEARCH BY ORDER ID (ROBUST)
    if (orderId) {
      console.log("🔍 Searching Order by orderId:", orderId);

      const order = await Order.findOne({
        orderId: orderId.toString().trim(),   // 🔥 force string match
      });

      if (!order) {
        console.log("❌ Order not found for:", orderId);
        return res.status(404).json({ message: "Order not found" });
      }

      // 🔥 IMPORTANT: adjust this if your ref field is different
      const customerId = order.userId || order.customer || order.user;

      if (!customerId) {
        console.log("❌ Order found but no customer ref:", order._id);
        return res.status(404).json({ message: "Customer not linked to order" });
      }

      const foundCustomer = await Customer.findById(customerId);

      if (!foundCustomer) {
        console.log("❌ Customer not found for order:", order._id);
        return res.status(404).json({ message: "Customer not found" });
      }

      customer = foundCustomer;
    }

    // ✅ 2. SEARCH BY EMAIL
    if (!customer && email) {
      customer = await Customer.findOne({ email });
    }


    // ✅ 3. SEARCH BY PHONE (ROBUST: MATCH LAST 10 DIGITS)
    if (!customer && phone) {
      const onlyDigits = phone.replace(/\D/g, "");
      const last10 = onlyDigits.slice(-10); // 🔥 always last 10 digits

      const matches = await Customer.find({
        phone: { $regex: `${last10}$` }  // ends with 7498722304
      });

      if (!matches || matches.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      if (matches.length === 1) {
        customer = matches[0];
      } else {
        return res.json(matches); // multiple customers with same phone
      }
    }

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    /* ============================================================
       ✅ REAL ORDER METRICS
    ============================================================ */
    const orders = await Order.find({ userId: customer._id });

    const delivered = orders.filter(o => o.status === "delivered");
    const cancelled = orders.filter(o => o.status === "cancelled");

    const ltv = delivered.reduce((sum, o) => sum + (o.amount || 0), 0);
    const aov = delivered.length > 0 ? Math.round(ltv / delivered.length) : 0;
    const returnRate =
      orders.length > 0
        ? Math.round((cancelled.length / orders.length) * 100)
        : 0;

    /* ============================================================
       ✅ LOAD ADDRESSES FROM ADDRESS COLLECTION (YOUR STRUCTURE)
    ============================================================ */
    const addressDocs = await Address.find({ user: customer._id });

    const addresses = addressDocs.map(addr =>
      `${addr.line1}, ${addr.city}, ${addr.state} - ${addr.pincode}`
    );

    /* ============================================================
       ✅ FINAL SAFE RESPONSE (NO UNDEFINED FIELDS)
    ============================================================ */
    res.json({
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.fullPhone || customer.phone || "-",

      addresses: addresses || [],      // ✅ SAFE
      tags: [],                        // ✅ SAFE
      consentEmail: true,
      consentSms: true,

      metrics: {
        ltv: ltv || 0,                 // ✅ SAFE
        aov: aov || 0,                 // ✅ SAFE
        returnRate: returnRate || 0,  // ✅ SAFE
      },
    });
  } catch (err) {
    console.error("CRM SEARCH ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
/* ============================================================
   ✅ TIMELINE (ORDERS → CRM FEED)
============================================================ */
router.get("/timeline/:id", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.id }).sort({
      createdAt: -1,
    });

    const timeline = orders.map(o => ({
      _id: o._id,
      type: "order",
      title: `Order ${o.orderId}`,
      description: `$${o.amount} • ${o.status}`,
      createdAt: o.createdAt,
    }));

    res.json(timeline);
  } catch (err) {
    console.error("CRM TIMELINE ERROR:", err);
    res.status(500).json([]);
  }
});
/* ============================================================
   ✅ PROMISES (EMPTY FOR NOW – READY)
============================================================ */
// POST /api/crm/promises/update-status
router.post("/promises/update-status", async (req, res) => {
  try {
    const { promiseId, newStatus } = req.body;

    if (!promiseId || !newStatus) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (!["fulfilled", "breached"].includes(newStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const updated = await CustomerPromise.findByIdAndUpdate(
      promiseId,
      {
        status: newStatus,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Promise not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error("PROMISE UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});

module.exports = router;
