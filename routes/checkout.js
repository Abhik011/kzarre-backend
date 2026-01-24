const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Stripe = require("stripe");

const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/product");
const User = require("../models/Customer"); // ✅ for email
const { sendEmail } = require("../utils/sendEmail");
const { sendNotification } = require("../utils/notify");
const { auth } = require("../middlewares/auth");
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ==================================================
   HELPERS
================================================== */
function generateOrderId() {
  return "ORD-" + Math.floor(100000 + Math.random() * 900000);
}

/* ==================================================
   GET SINGLE ORDER
================================================== */
router.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      order,
    });
  } catch (err) {
    console.error("CHECKOUT ORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ==================================================
   CREATE ORDER (STRIPE) — NO CONFIRM HERE
================================================== */
router.post("/create-order", auth(), async (req, res) => {
  try {
    const { productId, qty, size, color, address } = req.body;

    if (!address?.name || !address?.phone) {
      return res.status(400).json({
        success: false,
        message: "Address is required",
      });
    }

    const userId = req.user?._id || null;
    let items = [];
    let subtotal = 0;

    /* =====================================================
       BUY NOW FLOW
    ===================================================== */
    if (productId && qty) {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      if (product.stockQuantity < qty) {
        return res.status(400).json({
          success: false,
          message: "Out of stock",
        });
      }

      subtotal = product.price * qty;

      items.push({
        product: product._id,
        qty,
        price: product.price,
        name: product.name,
        image: product.imageUrl,
        size: size || "",
        color: color || "",
        sku: product.sku || "N/A",
      });
    }

    /* =====================================================
       CART FLOW
    ===================================================== */
    else {
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Login required for cart checkout",
        });
      }

      const cartDoc = await Cart.findOne({ userId });
      const cart = cartDoc?.items || [];

      if (!cart.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      for (const c of cart) {
        const product = await Product.findById(c.productId);
        if (!product) continue;

        if (product.stockQuantity < c.quantity) {
          return res.status(400).json({
            success: false,
            message: `${product.name} out of stock`,
          });
        }

        subtotal += product.price * c.quantity;

        items.push({
          product: product._id,
          qty: c.quantity,
          price: product.price,
          name: product.name,
          image: product.imageUrl,
          size: c.size || "",
          color: c.color || "",
          sku: product.sku || "N/A",
        });
      }
    }

    /* =====================================================
       CREATE ORDER
    ===================================================== */
    const order = await Order.create({
      userId,
      items,
      subtotal,
      deliveryFee: 15,
      amount: subtotal + 15,
      address,
      orderId: generateOrderId(),
      status: "pending_payment",
      paymentMethod: "STRIPE",
      requiresShipment: true,
      stockReduced: false,
      createdAt: new Date(),
    });

    res.json({ success: true, orderId: order.orderId });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



/* ==================================================
   STRIPE PAY
================================================== */
router.post("/stripe/pay", async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: order.items.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty,
      })),
      success_url: `${process.env.FRONTEND_BASE_URL}/payment/success?order=${order.orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_BASE_URL}/payment/cancel?order=${order.orderId}`,
      metadata: { orderId: order.orderId },
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    res.status(500).json({ success: false, message: "Stripe error" });
  }
});

router.post("/payment-cancel", async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false });

    if (!order.stockReduced) {
      order.status = "failed";
      await order.save();
      return res.json({ success: true });
    }

    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      if (product.variants?.length) {
        const v = product.variants.find(
          (v) => v.size === item.size && (item.color ? v.color === item.color : true)
        );
        if (v) v.stock += item.qty;

        product.stockQuantity = product.variants.reduce(
          (s, v) => s + Number(v.stock || 0),
          0
        );
      } else {
        product.stockQuantity += item.qty;
      }

      await product.save();
    }

    order.status = "failed";
    order.stockReduced = false;
    await order.save();

    res.json({ success: true, message: "Payment cancelled & stock restored" });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ==================================================
   COD — CONFIRM IMMEDIATELY
================================================== */
router.post("/cod", async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false });

    order.paymentMethod = "COD";
    order.status = "conform";
    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});
router.post("/refund", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID required" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status !== "paid") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be refunded (status: ${order.status})`,
      });
    }

    if (!order.paymentId) {
      return res.status(400).json({
        success: false,
        message: "No payment ID found for this order",
      });
    }

    // ✅ 1️⃣ Create Stripe refund
    const refund = await stripe.refunds.create({
      payment_intent: order.paymentId,
      reason: "requested_by_customer",
    });

    // ✅ 2️⃣ Restore stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      if (product.variants?.length) {
        const v = product.variants.find(
          (v) =>
            v.size === item.size &&
            (item.color ? v.color === item.color : true)
        );
        if (v) {
          v.stock = (v.stock || 0) + item.qty;
        }
        product.stockQuantity = product.variants.reduce(
          (s, v) => s + (v.stock || 0),
          0
        );
      } else {
        product.stockQuantity = (product.stockQuantity || 0) + item.qty;
      }

      await product.save();
    }

    // ✅ 3️⃣ Mark order as refunded
    order.status = "refunded";
    order.refundId = refund.id;
    await order.save();

    res.json({
      success: true,
      message: "Payment refunded successfully",
      refund,
      order,
    });
  } catch (err) {
    console.error("REFUND ERROR:", err);
    res.status(500).json({ success: false, message: "Refund failed" });
  }
});

router.post("/create", auth(), async (req, res) => {
  try {
    const userId = req.user._id;

    /* =========================
       1️⃣ CHECK EXISTING DRAFT
    ========================= */
    const existingOrder = await Order.findOne({
      userId,
      status: "pending_payment",
    });

    if (existingOrder) {
      return res.json({
        success: true,
        orderId: existingOrder.orderId,
        reused: true,
      });
    }

    /* =========================
       2️⃣ LOAD CART
    ========================= */
    const cartDoc = await Cart.findOne({ userId });
    const cart = cartDoc?.items || [];

    if (!cart.length) {
      return res
        .status(400)
        .json({ success: false, message: "Cart is empty" });
    }

    /* =========================
       3️⃣ BUILD ORDER ITEMS
    ========================= */
    let subtotal = 0;
    const items = [];

    for (const c of cart) {
      const product = await Product.findById(c.productId);
      if (!product) {
        return res.status(404).json({ success: false });
      }

      if (product.stockQuantity < c.quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} out of stock`,
        });
      }

      subtotal += product.price * c.quantity;

      items.push({
        product: product._id,
        qty: c.quantity,
        price: product.price,
        name: product.name,
        image: product.imageUrl,
        size: c.size || "",
        sku: product.sku || "N/A",
      });
    }

    /* =========================
       4️⃣ CREATE DRAFT ORDER
    ========================= */
    const order = await Order.create({
      userId,
      items,
      subtotal,
      deliveryFee: 15,
      amount: subtotal + 15,

      address: null,                // 🔥 later
      orderId: generateOrderId(),

      status: "pending_payment",     // 🔥 draft
      paymentMethod: "PENDING",

      requiresShipment: true,
      stockReduced: false,
      createdAt: new Date(),
    });

    /* =========================
       5️⃣ RESPONSE
    ========================= */
    res.json({
      success: true,
      orderId: order.orderId,
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ success: false });
  }
});


module.exports = router;

