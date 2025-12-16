const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Stripe = require("stripe");

const Order = require("../models/Order");
const Product = require("../models/product");
const User = require("../models/Customer"); // ✅ for email
const { sendEmail } = require("../utils/sendEmail");
const { sendNotification } = require("../utils/notify");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
router.post("/create-order", async (req, res) => {
  try {
    const { userId, productId, qty, size, color, address } = req.body;

    if (!productId || !qty || !address) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    const product = await Product.findById(productId);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    // 🔍 Validate stock
    let variant = null;

    if (product.variants?.length) {
      variant = product.variants.find(
        (v) => v.size === size && (color ? v.color === color : true)
      );

      if (!variant || (variant.stock || 0) < qty) {
        return res.status(400).json({
          success: false,
          message: "Variant out of stock",
        });
      }

      // 🔒 LOCK STOCK
      variant.stock -= qty;
      product.stockQuantity = product.variants.reduce(
        (s, v) => s + Number(v.stock || 0),
        0
      );
    } else {
      if ((product.stockQuantity || 0) < qty) {
        return res.status(400).json({
          success: false,
          message: "Out of stock",
        });
      }

      product.stockQuantity -= qty;
    }

    await product.save();

    // ✅ GET USER EMAIL
    let userEmail = address?.email || null;
    if (userId) {
      const user = await User.findById(userId).select("email");
      if (user?.email) userEmail = user.email;
    }

    const subtotal = product.price * qty;
    const deliveryFee = 15;
    const totalAmount = subtotal + deliveryFee;

    const order = await Order.create({
      userId: userId ? new mongoose.Types.ObjectId(userId) : null,
      email: userEmail, // ✅ STORED
      items: [
        {
          product: productId,
          qty,
          price: product.price,
          name: product.name,
          image: product.imageUrl,
          size: size || "",
          color: color || "",
          sku: product.sku || "N/A",
          barcode: variant?.barcode || product.sku || "N/A",
        },
      ],
      address,
      amount: totalAmount,
      orderId: generateOrderId(),

      paymentMethod: "STRIPE",
      paymentId: null,

      status: "pending_payment", 
      stockReduced: true,
      createdAt: new Date(),
    });

    res.json({ success: true, orderId: order.orderId, order });
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

module.exports = router;

