const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  email: { type: String },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      qty: { type: Number, required: true },
      price: { type: Number, required: true },

      name: { type: String },
      image: { type: String },
      sku: { type: String },
      barcode: { type: String },

      size: { type: String },
      color: { type: String }
    }
  ],

  address: {
    name: String,
    phone: String,
    pincode: String,
    city: String,
    state: String,
    line1: String,
  },

  amount: Number,

  paymentMethod: { type: String, default: "COD" },
  paymentId: String,
  orderId: String,

status: {
  type: String,
  enum: [
    "pending_payment",
    "paid",
    "failed",
    "cancelled",
    "shipped",
    "delivered",
    "refunded",
  ],
  default: "pending_payment",
},
  
stockReduced: { type: Boolean, default: false },

  shipment: {
    carrier: {
      type: String,
      enum: ["ups", "fedex", "dhl", "manual"],
    },
    trackingId: String,

    status: {
      type: String,
      enum: [
        "label_created",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "exception",
      ],
    },

    labelUrl: String,
    shippedAt: Date,
    deliveredAt: Date,
  },

  createdAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.Order || mongoose.model("Order", orderSchema);
