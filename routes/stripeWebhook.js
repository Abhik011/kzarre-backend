const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const Order = require("../models/Order");
const CourierPartner = require("../models/CourierPartner.model"); // ✅ make sure path is correct
const createShipment = require("../services/createShipment");

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* =====================================================
   🔔 STRIPE WEBHOOK
===================================================== */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("✅ STRIPE WEBHOOK HIT");

    if (!stripe) {
      console.error("❌ Stripe not configured");
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const sig = req.headers["stripe-signature"];
    let event;

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
      /* =====================================================
         ✅ CHECKOUT SESSION COMPLETED
      ===================================================== */
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;
        if (!orderId) return res.json({ received: true });

        const order = await Order.findOne({ orderId });
        if (!order || order.status === "paid") {
          return res.json({ received: true });
        }

        /* =====================
           1️⃣ MARK ORDER PAID
        ===================== */
        order.status = "paid";
        order.paymentMethod = "STRIPE";
        order.paymentId = session.payment_intent;
        await order.save();

        console.log("✅ ORDER PAID:", orderId);

        /* =====================
           2️⃣ AUTO CREATE SHIPMENT
        ===================== */
        // Prevent duplicate shipment
        if (!order.shipment?.trackingId) {
          const courier = await CourierPartner.findOne({
            slug: "easyship",
            enabled: true,
          });
        
          if (courier) {
            try {
              const shipment = await createShipment(order, courier);

              order.shipment = {
                carrier: courier.slug,
                trackingId: shipment.trackingId || null,
                labelUrl: shipment.labelUrl || null,
                status: "label_created",
                history: [],
                raw: shipment.raw,
                createdAt: new Date(),
              };

              // Optional: move to shipped only if tracking exists
              if (shipment.trackingId) {
                order.status = "shipped";
              }

              await order.save();

              console.log(
                "📦 SHIPMENT CREATED:",
                shipment.trackingId || "PENDING"
              );
            } catch (err) {
              console.error("🚫 SHIPMENT ERROR:", err.message);
            }
            
          } else {
            console.warn("⚠️ EasyShip courier not enabled");
          }
        }
      }

      /* =====================================================
         ✅ PAYMENT INTENT SUCCEEDED (CLI / FALLBACK)
      ===================================================== */
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object;
        const orderId = pi.metadata?.orderId;
        if (!orderId) return res.json({ received: true });

        const order = await Order.findOne({ orderId });
        if (!order || order.status === "paid") {
          return res.json({ received: true });
        }

        order.status = "paid";
        order.paymentMethod = "STRIPE";
        order.paymentId = pi.id;
        await order.save();

        console.log("✅ ORDER CONFIRMED (PAYMENT_INTENT):", orderId);
      }

      /* =====================================================
         ❌ FAILED / EXPIRED
      ===================================================== */
      if (
        event.type === "checkout.session.expired" ||
        event.type === "payment_intent.payment_failed"
      ) {
        const obj = event.data.object;
        const orderId = obj.metadata?.orderId;
        if (!orderId) return res.json({ received: true });

        const order = await Order.findOne({ orderId });
        if (!order || ["paid", "refunded"].includes(order.status)) {
          return res.json({ received: true });
        }

        order.status = "failed";
        order.paymentId = null;
        await order.save();

        console.log("❌ PAYMENT FAILED:", orderId);
      }

      /* =====================================================
         🔁 REFUND
      ===================================================== */
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
