const express = require("express");
const router = express.Router();

// MODELS
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const Traffic = require("../models/Traffic");
const Product = require("../models/Product");
// =============================
// 📌 SUMMARY
// =============================
router.get("/summary", async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalUsers = await Customer.countDocuments();

    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const newUsers = await Customer.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    res.json({
      success: true,
      summary: {
        totalOrders,
        totalUsers,
        newUsers,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error("Summary Error:", err);
    res.status(500).json({ success: false, message: "Analytics summary failed" });
  }
});


// =============================
// 📌 TRAFFIC DAILY
// (Fix: MongoDB does NOT support %a)
// =============================
router.get("/traffic/daily", async (req, res) => {
  try {
    const analytics = await Traffic.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          visits: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, traffic: analytics });

  } catch (e) {
    console.error("Traffic Error:", e);
    res.status(500).json({ success: false, message: "Traffic failed" });
  }
});


// =============================
// 📌 NEW vs RETURNING USERS
// =============================
router.get("/users/type", async (req, res) => {
  try {
    const newUsers = await Customer.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    const totalUsers = await Customer.countDocuments();

    res.json({
      success: true,
      newUsers,
      returningUsers: totalUsers - newUsers,
    });

  } catch (err) {
    console.error("User type error:", err);
    res.status(500).json({ success: false, message: "User type failed" });
  }
});


// =============================
// 📌 ORDERS DAILY
// =============================
router.get("/orders/daily", async (req, res) => {
  try {
    const orders = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, orders });

  } catch (err) {
    console.error("Orders daily error:", err);
    res.status(500).json({ success: false, message: "Daily orders failed" });
  }
});


// =============================
// 📌 TOP 5 SELLING PRODUCTS
// =============================
router.get("/top-products", async (req, res) => {
  try {
    const products = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          sold: { $sum: "$items.quantity" },
        },
      },
      { $sort: { sold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 1,
          sold: 1,
          name: "$product.name",
          category: "$product.category",
        },
      },
    ]);

    res.json({ success: true, products });

  } catch (err) {
    console.error("Top products error:", err);
    res.status(500).json({ success: false, message: "Top products failed" });
  }
});


// =============================
// 📌 CATEGORY SALES REPORT
// =============================
router.get("/category-sales", async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          total: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.price" },
        },
      },
      { $sort: { total: -1 } }
    ]);

    res.json({ success: true, data });

  } catch (err) {
    console.error("Category sales error:", err);
    res.status(500).json({ success: false, message: "Category sales failed" });
  }
});

module.exports = router;
