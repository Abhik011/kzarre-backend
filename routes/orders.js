const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/product");
const CourierPartner = require("../models/CourierPartner.model");
const createShipment = require("../services/createShipment");

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
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters"
      });
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    // Search by orderId, customer email, or customer name
    const orders = await Order.find({
      $or: [
        { orderId: searchRegex },
        { email: searchRegex },
        { customerName: searchRegex }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("orderId amount status createdAt customerName email items");

    return res.status(200).json({
      success: true,
      orders: orders.map(order => ({
        _id: order._id,
        orderId: order.orderId,
        customer: order.customerName || order.email,
        email: order.email,
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items?.length || 0
      }))
    });
  } catch (err) {
    console.error("ORDER SEARCH ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to search orders",
    });
  }
});


router.get("/top", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;

    const dbOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("orderId amount status createdAt email address customerName");

    const orders = dbOrders.map(o => ({
      _id: o._id.toString(),
      orderId: o.orderId || o._id.toString(),
      customer:
        o.address?.name ||
        o.customerName ||
        o.email ||
        "Unknown Customer",
      amount: Number(o.amount) || 0,
      status: o.status || "pending",
      createdAt: o.createdAt,
    }));

    return res.json({
      success: true,
      orders,
    });
  } catch (err) {
    console.error("TOP ORDERS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch top orders",
    });
  }
});

// router.get("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const order = await Order.findById(id).select("-__v");

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found"
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       order: {
//         _id: order._id,
//         orderId: order.orderId,
//         customer: order.customerName || order.userId?.name || order.email || "",
//         email: order.email,
//         phone: order.phone,
//         amount: order.amount,
//         status: order.status,
//         paymentStatus: order.paymentStatus,
//         createdAt: order.createdAt,
//         items: order.items || [],
//         shippingAddress: order.shippingAddress
//       }
//     });
//   } catch (err) {
//     console.error("GET ORDER ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch order",
//     });
//   }
// });

router.get("/by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).select("-__v");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    return res.status(200).json({
      success: true,
      order: {
        _id: order._id,
        orderId: order.orderId,
        customer: order.customerName || order.userId?.name || order.email || "",
        email: order.email,
        phone: order.phone,
        amount: order.amount,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        items: order.items || [],
        shippingAddress: order.shippingAddress
      }
    });
  } catch (err) {
    console.error("GET ORDER BY ID ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order by id",
    });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    return res.status(200).json({
      success: true,
      order: {
        _id: order._id,
        status: order.status
      }
    });
  } catch (err) {
    console.error("UPDATE ORDER STATUS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update order status",
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

// ==================================================
// 🚚 ADMIN: CREATE SHIPMENT & ASSIGN TRACKING
// POST /api/orders/:orderId/ship
// ==================================================
router.post("/:orderId/ship", async (req, res) => {
  try {
    const { courierSlug } = req.body;

    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    if (order.shipment?.trackingId) {
      return res.status(400).json({
        success: false,
        message: "Shipment already created",
      });
    }

    const courier = await CourierPartner.findOne({
      slug: courierSlug,
      enabled: true,
    });

    if (!courier)
      return res.status(400).json({
        success: false,
        message: "Courier not found or disabled",
      });

    // 🔥 CREATE SHIPMENT (DYNAMIC)
    const shipment = await createShipment(order, courier);

    order.shipment = {
      carrier: courier.slug,
      trackingId: shipment.trackingId,
      labelUrl: shipment.labelUrl,
      status: "label_created",
      shippedAt: new Date(),
    };

    order.status = "shipped";
    await order.save();

    return res.json({
      success: true,
      message: "Shipment created",
      order,
    });
  } catch (err) {
    console.error("SHIP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Shipment creation failed",
    });
  }
});

// ==================================================
// 🚚 ADMIN: UPDATE SHIPMENT STATUS
// PATCH /api/orders/:orderId/shipment
// ==================================================
router.patch("/:orderId/shipment", async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = [
      "label_created",
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "exception",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shipment status",
      });
    }

    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order || !order.shipment)
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });

    order.shipment.status = status;

    if (status === "delivered") {
      order.shipment.deliveredAt = new Date();
      order.status = "delivered";
    }

    await order.save();

    return res.json({
      success: true,
      message: "Shipment updated",
      order,
    });
  } catch (err) {
    console.error("SHIPMENT UPDATE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update shipment",
    });
  }
});

module.exports = router;
