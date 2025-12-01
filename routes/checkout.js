const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Product = require("../models/product");

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/*
|--------------------------------------------------------------------------
| ✅ CREATE ORDER BEFORE PAYMENT
| POST /api/checkout/create-order
|--------------------------------------------------------------------------
*/
router.post("/create-order", async (req, res) => {
  try {
    const { userId, productId, qty, size, color, address } = req.body;

    if (!productId || !qty || !address) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    let variant = null;

    if (Array.isArray(product.variants) && product.variants.length > 0) {
      variant = product.variants.find(
        (v) => v.size === size && (color ? v.color === color : true)
      );

      if (!variant)
        return res.status(400).json({ success: false, message: "Variant not found" });

      if (variant.stock < qty)
        return res
          .status(400)
          .json({ success: false, message: `Only ${variant.stock} left` });
    } else {
      if ((product.stockQuantity || 0) < qty)
        return res
          .status(400)
          .json({ success: false, message: `Only ${product.stockQuantity} left` });
    }

    const subtotal = product.price * qty;
    const deliveryFee = 15;
    const totalAmount = subtotal + deliveryFee;

    const generatedOrderId =
      "ORD-" + Math.floor(100000 + Math.random() * 900000);

    const order = await Order.create({
      userId: userId ? new mongoose.Types.ObjectId(userId) : null,
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
      paymentMethod: "ONLINE",
      paymentId: null,
      orderId: generatedOrderId,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({ success: true, orderId: generatedOrderId, order });
  } catch (err) {
    console.error("create-order error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/*
|--------------------------------------------------------------------------
| ✅ GET ORDER
| GET /api/checkout/order/:orderId
|--------------------------------------------------------------------------
*/
router.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params; // ✅ FIX IS HERE

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
    console.error("GET ORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


/*
|--------------------------------------------------------------------------
| ✅ STRIPE PAY (CREATE CHECKOUT SESSION)
| POST /api/checkout/stripe/pay
|--------------------------------------------------------------------------
*/
router.post("/stripe/pay", async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const lineItems = order.items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.name },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: Number(item.qty),
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_BASE_URL}/payment/success?order=${order.orderId}`,
      cancel_url: `${process.env.FRONTEND_BASE_URL}/payment/cancel?order=${order.orderId}`,
      metadata: { orderId: order.orderId },
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error("stripe/pay error:", err.message);
    res.status(500).json({ success: false, message: "Stripe error" });
  }
});

/*
|--------------------------------------------------------------------------
| ✅ STRIPE SUCCESS CONFIRM (REDUCE STOCK + MARK PAID)
| POST /api/checkout/stripe/confirm
|--------------------------------------------------------------------------
*/
router.post("/stripe/confirm", async (req, res) => {
  try {
    const { orderId, paymentIntentId } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false });

    if (order.status === "paid") {
      return res.json({ success: true, message: "Already paid" });
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      return res.status(400).json({ success: false, message: "Payment not verified" });
    }

    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (!product) continue;

      if (Array.isArray(product.variants) && product.variants.length > 0) {
        const variant = product.variants.find(
          (v) => v.size === item.size && (item.color ? v.color === item.color : true)
        );
        if (variant) variant.stock = Math.max(0, variant.stock - item.qty);

        product.stockQuantity = product.variants.reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
      } else {
        product.stockQuantity = Math.max(
          0,
          (product.stockQuantity || 0) - item.qty
        );
      }

      await product.save();
    }

    order.status = "paid";
    order.paymentId = paymentIntentId;
    order.paymentMethod = "ONLINE";
    await order.save();

    res.json({ success: true, message: "Payment confirmed" });
  } catch (err) {
    console.error("stripe/confirm error:", err);
    res.status(500).json({ success: false });
  }
});

/*
|--------------------------------------------------------------------------
| ✅ CASH ON DELIVERY
| POST /api/orders/cod
|--------------------------------------------------------------------------
*/
router.post("/cod", async (req, res) => {
  const { orderId, userId, email } = req.body;

  const order = await Order.findOne({ orderId });
  if (!order) return res.status(404).json({ success: false });

  order.status = "paid";
  order.paymentMethod = "COD";
  await order.save();

  res.json({ success: true });
});

/*
|--------------------------------------------------------------------------
| ❌ PAYMENT CANCEL
|--------------------------------------------------------------------------
*/
router.post("/payment-cancel", async (req, res) => {
  const { orderId } = req.body;
  await Order.findOneAndDelete({ orderId });
  res.json({ success: true });
});

module.exports = router;
