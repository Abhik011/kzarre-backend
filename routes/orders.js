const express = require("express");
const router = express.Router();
const Order = require("../models/Order");

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
// 1. COD ORDER
// ==================================================
router.post("/cod", async (req, res) => {
  try {
    const { orderId, userId, email } = req.body;

    if (!orderId)
      return res.status(400).json({ success: false, message: "Order ID missing" });

    const order = await Order.findOne({ orderId });
    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    if (userId && order.userId?.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Order does not belong to this user",
      });
    }

    order.paymentMethod = "COD";
    order.status = "pending";
    await order.save();

    return res.status(200).json({
      success: true,
      message: "COD Order Confirmed Successfully",
      orderId: order.orderId,
      order,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error Processing COD",
    });
  }
});

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
// ✅ 5. CANCEL ORDER (USER)
// URL: PUT /api/orders/cancel/:orderId
// ==================================================
router.put("/cancel/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ❌ Already cancelled
    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Order already cancelled",
      });
    }

    // ❌ Delivered orders cannot be cancelled
    if (order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Delivered order cannot be cancelled",
      });
    }

    // ✅ ALLOW cancel only if:
    // pending | paid | failed | shipped
    const cancellable = ["pending", "paid", "failed", "shipped"];

    if (!cancellable.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled in '${order.status}' state`,
      });
    }

    // ✅ UPDATE STATUS
    order.status = "cancelled";
    order.cancelledAt = new Date();

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order,
    });
  } catch (error) {
    console.error("CANCEL ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while cancelling order",
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
