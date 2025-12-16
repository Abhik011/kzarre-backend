const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const Order = require("../models/Order");
const Product = require("../models/product"); // ✅ REQUIRED
const { sendNotification } = require("../utils/notify");
const { sendEmail } = require("../utils/sendEmail");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * ⚠️ IMPORTANT
 * This route MUST use express.raw
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("✅ STRIPE WEBHOOK HIT");

    let event;
    const sig = req.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      /* ===============================
         PAYMENT SUCCESS
      =============================== */
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;
        if (!orderId) return res.json({ received: true });

        const order = await Order.findOne({ orderId });
        if (!order) return res.json({ received: true });

        // ✅ Idempotent
        if (order.status === "paid") {
          return res.json({ received: true });
        }

        order.status = "paid";
        order.paymentMethod = "STRIPE";
        order.paymentId = session.payment_intent;
        await order.save();

        sendNotification({
          type: "order-confirmed",
          title: "Order Confirmed",
          message: `Order #${order.orderId} confirmed via Stripe`,
          orderId: order._id,
        });

        if (order.email) {
          await sendEmail(
            order.email,
            "Payment Successful – KZARRÈ",
            `
              <h2>Payment Successful ✅</h2>
              <p><b>Order ID:</b> ${order.orderId}</p>
              <p>Status: <b>Confirmed</b></p>
            `
          );
        }

        console.log("ORDER CONFIRMED:", orderId);
      }

      /* ===============================
         PAYMENT FAILED / EXPIRED
      =============================== */
      if (
        event.type === "checkout.session.expired" ||
        event.type === "payment_intent.payment_failed"
      ) {
        const obj = event.data.object;
        const orderId = obj.metadata?.orderId;
        if (!orderId) return res.json({ received: true });

        const order = await Order.findOne({ orderId });
        if (!order) return res.json({ received: true });

        // Already finalized
        if (["paid", "refunded"].includes(order.status)) {
          return res.json({ received: true });
        }

        // 🔁 RESTORE STOCK (PRO LEVEL SAFETY)
        if (order.stockReduced) {
          for (const item of order.items) {
            const product = await Product.findById(item.product);
            if (!product) continue;

            if (product.variants?.length) {
              const v = product.variants.find(
                v =>
                  v.size === item.size &&
                  (!item.color || v.color === item.color)
              );
              if (v) v.stock += item.qty;

              product.stockQuantity = product.variants.reduce(
                (sum, v) => sum + (v.stock || 0),
                0
              );
            } else {
              product.stockQuantity += item.qty;
            }

            await product.save();
          }

          order.stockReduced = false;
        }

        order.status = "failed";
        order.paymentId = null;
        await order.save();

        console.log("❌ PAYMENT FAILED & STOCK RESTORED:", orderId);
      }

      /* ===============================
         REFUND COMPLETED
      =============================== */
      if (event.type === "charge.refunded") {
        const charge = event.data.object;

        const order = await Order.findOne({
          paymentId: charge.payment_intent,
        });

        if (order) {
          order.status = "refunded";
          await order.save();
          console.log("🔁 ORDER REFUNDED:", order.orderId);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("❌ WEBHOOK HANDLER ERROR:", err);
      res.status(500).json({ success: false });
    }
  }
);

module.exports = router;
