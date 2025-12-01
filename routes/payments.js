// routes/payments.js
const express = require("express");
const router = express.Router();
require("dotenv").config();

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const paypal = require("@paypal/checkout-server-sdk");

// ✅ OPTIONAL: protect payment routes if you have auth middleware
// const { auth } = require("../middlewares/auth");

// ✅ Order Model
const Order = require("../models/Order");

// -------------------- HELPERS --------------------
function calculateTotal(items = []) {
  return items.reduce(
    (sum, i) => sum + Number(i.price || 0) * Number(i.qty || 1),
    0
  );
}

// ✅ PayPal Environment (USD)
function paypalClient() {
  const env =
    process.env.PAYPAL_MODE === "production"
      ? new paypal.core.LiveEnvironment(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET
        )
      : new paypal.core.SandboxEnvironment(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET
        );
  return new paypal.core.PayPalHttpClient(env);
}

// ======================================================
// ✅ STRIPE — CREATE CHECKOUT SESSION (USD)
// ======================================================
router.post("/create-stripe-session", async (req, res) => {
  try {
    const { items, customerEmail, address } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const line_items = items.map((it) => ({
      price_data: {
        currency: "usd", // ✅ USD ONLY
        product_data: {
          name: it.name,
          images: it.images || [],
        },
        unit_amount: Math.round(Number(it.price) * 100),
      },
      quantity: Number(it.qty || 1),
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: `${process.env.FRONTEND_BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_BASE_URL}/payment/cancel`,
      customer_email: customerEmail,
      metadata: { source: "kzarre-web" },
    });

    const order = await Order.create({
      items,
      total: calculateTotal(items),
      status: "pending",
      paymentMethod: "stripe",
      stripeSessionId: session.id,
      customerEmail,
      shippingAddress: address || null,
    });

    res.json({ sessionId: session.id, orderId: order._id });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================================
// ✅ STRIPE WEBHOOK (USD CONFIRMATION)
// ======================================================
router.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("Stripe webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      await Order.findOneAndUpdate(
        { stripeSessionId: session.id },
        {
          status: "paid",
          paymentConfirmedAt: new Date(),
          paymentDetails: session,
        }
      );
    }

    res.json({ received: true });
  }
);

// ======================================================
// ✅ PAYPAL — CREATE ORDER (USD)
// ======================================================
router.post("/paypal/create-order", async (req, res) => {
  try {
    const { items, returnUrl, cancelUrl, customerEmail, address } = req.body;
    const client = paypalClient();

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const total = calculateTotal(items).toFixed(2);

    const purchase_units = [
      {
        amount: {
          currency_code: "USD", // ✅ USD ONLY
          value: total,
        },
        items: items.map((it) => ({
          name: it.name,
          sku: it.sku || "sku",
          unit_amount: {
            currency_code: "USD",
            value: Number(it.price).toFixed(2),
          },
          quantity: String(it.qty || 1),
        })),
      },
    ];

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units,
      application_context: {
        brand_name: "KZARRE",
        return_url:
          returnUrl ||
          `${process.env.FRONTEND_BASE_URL}/payment/paypal-success`,
        cancel_url:
          cancelUrl || `${process.env.FRONTEND_BASE_URL}/payment/cancel`,
      },
    });

    const createOrderResponse = await client.execute(request);

    const order = await Order.create({
      items,
      total: Number(total),
      status: "pending",
      paymentMethod: "paypal",
      paypalOrderId: createOrderResponse.result.id,
      customerEmail,
      shippingAddress: address || null,
    });

    const approval = createOrderResponse.result.links.find(
      (l) => l.rel === "approve"
    );

    res.json({
      orderID: createOrderResponse.result.id,
      approvalUrl: approval.href,
      orderId: order._id,
    });
  } catch (err) {
    console.error("PayPal create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================================
// ✅ PAYPAL — CAPTURE PAYMENT (USD)
// ======================================================
router.post("/paypal/capture", async (req, res) => {
  try {
    const { orderID } = req.body;
    const client = paypalClient();

    if (!orderID) {
      return res.status(400).json({ error: "orderID required" });
    }

    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await client.execute(request);

    await Order.findOneAndUpdate(
      { paypalOrderId: orderID },
      {
        status: "paid",
        paymentDetails: capture.result,
        paymentConfirmedAt: new Date(),
      }
    );

    res.json({ success: true, capture });
  } catch (err) {
    console.error("PayPal capture error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
