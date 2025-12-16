const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/product");

// ================================
// ADMIN AUTH
// ================================
function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

// ==================================================
// ⭐ 6. TOP ORDERS (FOR DASHBOARD)
// ==================================================
router.get("/top", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;

    const orders = await Order.find()
      .sort({ createdAt: -1 })     // latest orders
      .limit(limit)
      .select("orderId amount status createdAt customerName email");

    const formatted = orders.map((o) => ({
      _id: o.orderId,
      customer: o.address?.name || o.userId?.name || o.email || "",

      amount: o.amount,
      status: o.status,
      createdAt: o.createdAt,
    }));

    return res.status(200).json({
      success: true,
      orders: formatted,
    });
  } catch (err) {
    console.error("TOP ORDERS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch top orders",
    });
  }
});

// ==================================================
// 1. COD ORDER
// ==================================================
// router.post("/cod", async (req, res) => {
//   try {
//     const { orderId, userId, email } = req.body;

//     if (!orderId)
//       return res.status(400).json({ success: false, message: "Order ID missing" });

//     const order = await Order.findOne({ orderId });
//     if (!order)
//       return res.status(404).json({ success: false, message: "Order not found" });

//     if (userId && order.userId?.toString() !== userId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "Unauthorized: Order does not belong to this user",
//       });
//     }

//     order.paymentMethod = "COD";
//     order.status = "pending";
//     await order.save();

//     return res.status(200).json({
//       success: true,
//       message: "COD Order Confirmed Successfully",
//       orderId: order.orderId,
//       order,
//     });

//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Server Error Processing COD",
//     });
//   }
// });

// ==================================================
// 2. USER ORDERS
// ==================================================
router.get("/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, orders });
  } catch {
    return res.status(500).json({ success: false, message: "Error fetching user orders" });
  }
});

// ==================================================
// 3. GET ALL ORDERS
// ==================================================
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, orders });
  } catch {
    return res.status(500).json({ success: false, message: "Error fetching orders" });
  }
});

// ==================================================
// ⭐ 4. UPDATE STATUS — MUST COME BEFORE GET ONE
// ==================================================
router.patch("/:orderId/status", async (req, res) => {
  try {
    const { status } = req.body;

    const valid = ["pending", "paid", "failed", "shipped", "delivered", "cancelled"];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: "Invalid status" });

    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { $set: { status } },
      { new: true, runValidators: true }      // 👈 THIS FIXES THE ISSUE
    );

    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    return res.status(200).json({ success: true, order });

  } catch (err) {
    console.log("UPDATE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Error updating status",
    });
  }
});


// ==================================================
// 5. CANCEL ORDER
// ==================================================
// ==================================================
router.put("/cancel/:orderId", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    if (order.status === "cancelled")
      return res.status(400).json({ success: false, message: "Already cancelled" });

    if (order.status === "delivered")
      return res.status(400).json({ success: false, message: "Delivered cannot cancel" });

    // ✅ RESTORE STOCK (SAFE)
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      if (product.variants?.length) {
        const variant = product.variants.find(
          v =>
            v.size === item.size &&
            (item.color ? v.color === item.color : true)
        );
        if (variant) variant.stock += item.qty;

        product.stockQuantity = product.variants.reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
      } else {
        product.stockQuantity += item.qty;
      }

      await product.save();
    }

    order.status = "cancelled";
    await order.save();

    return res.json({
      success: true,
      message: "Order cancelled & stock restored",
      order,
    });
  } catch (err) {
    console.error("CANCEL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Cancel failed",
    });
  }
});

// ==================================================
// ⭐ 6. GET SINGLE ORDER (MUST BE LAST)
// ==================================================
router.get("/:orderId", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    return res.status(200).json({ success: true, order });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Error fetching order",
    });
  }
});

module.exports = router;
