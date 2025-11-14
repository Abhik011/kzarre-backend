const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    totalAmount: { type: Number, default: 0 },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: Number,
        price: Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
