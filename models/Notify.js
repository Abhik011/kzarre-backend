const mongoose = require("mongoose");

const notifySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // ✅ Variant-aware fields (OPTIONAL for old data)
    size: {
      type: String,
      default: null,
    },

    color: {
      type: String,
      default: null,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    notified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* ✅ Prevent duplicate notify for same variant */
notifySchema.index(
  { productId: 1, email: 1, size: 1, color: 1 },
  { unique: true }
);

module.exports = mongoose.model("Notify", notifySchema);
