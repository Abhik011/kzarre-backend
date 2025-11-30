const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Product = require("../models/product");

/*
|--------------------------------------------------------------------------
| ⭐ CREATE ORDER BEFORE PAYMENT (Checkout Step)
|       POST /api/checkout/create-order
|--------------------------------------------------------------------------
*/
router.post("/create-order", async (req, res) => {
  try {
    const { userId, productId, qty, size, color, address } = req.body;

    if (!productId || !qty || !address) {
      return res.status(400).json({
        success: false,
        message: "Missing fields",
      });
    }

    // ✅ Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let variant = null;

    // ✅ Variant check ONLY (NO STOCK REDUCTION HERE)
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      variant = product.variants.find(
        (v) => v.size === size && (color ? v.color === color : true)
      );

      if (!variant) {
        return res.status(400).json({
          success: false,
          message: "Selected size/color not available",
        });
      }

      if (variant.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.stock} items left in stock`,
        });
      }
    } else {
      // ✅ Simple product stock check ONLY
      if ((product.stockQuantity || 0) < qty) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stockQuantity} items left`,
        });
      }
    }

    // ✅ Calculate totals
    const subtotal = product.price * qty;
    const deliveryFee = 15;
    const totalAmount = subtotal + deliveryFee;

    // ✅ Generate order ID
    const generatedOrderId =
      "ORD-" + Math.floor(100000 + Math.random() * 900000);

    // ✅ Create PENDING Order (NO STOCK TOUCHED)
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
      paymentStatus: "unpaid",

      createdAt: new Date(),
    });

    return res.json({
      success: true,
      orderId: generatedOrderId,
      order,
    });

  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
});





/*
|--------------------------------------------------------------------------
| ⭐ GET ORDER BY READABLE ORDER ID
|       GET /api/checkout/order/:orderId
|--------------------------------------------------------------------------
*/
router.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    // Find by readable ID, not _id
    const order = await Order.findOne({ orderId }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (err) {
    console.error("GET ORDER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});
router.post("/payment-success", async (req, res) => {
  try {
    const { orderId, paymentId } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // ✅ Loop through all items & reduce stock NOW
    for (const item of order.items) {
      const product = await Product.findById(item.product);

      if (!product) continue;

      if (Array.isArray(product.variants) && product.variants.length > 0) {
        const variant = product.variants.find(
          (v) =>
            v.size === item.size &&
            (item.color ? v.color === item.color : true)
        );

        if (variant) {
          variant.stock -= item.qty;
          if (variant.stock < 0) variant.stock = 0;
        }

        product.stockQuantity = product.variants.reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        );
      } else {
        product.stockQuantity -= item.qty;
        if (product.stockQuantity < 0) product.stockQuantity = 0;
      }

      await product.save();
    }

    // ✅ Mark order paid
    order.paymentStatus = "paid";
    order.paymentId = paymentId || "ONLINE";
    order.status = "confirmed";

    await order.save();

    return res.json({
      success: true,
      message: "Payment success & stock updated",
    });

  } catch (err) {
    console.error("payment-success error:", err);
    return res.status(500).json({
      success: false,
      message: "Payment success failed",
    });
  }
});
router.post("/payment-cancel", async (req, res) => {
  try {
    const { orderId } = req.body;

    await Order.findOneAndDelete({ orderId });

    return res.json({
      success: true,
      message: "Order cancelled & removed",
    });

  } catch (err) {
    console.error("payment-cancel error:", err);
    return res.status(500).json({
      success: false,
      message: "Cancel failed",
    });
  }
});

/*
|--------------------------------------------------------------------------
| ✅ ADMIN: DELETE ALL ORDERS
|     DELETE /api/checkout/delete-all-orders
|--------------------------------------------------------------------------
*/
router.delete("/delete-all-orders", async (req, res) => {
  try {
    const result = await Order.deleteMany({});

    return res.json({
      success: true,
      message: "✅ All orders deleted successfully",
      deletedCount: result.deletedCount,
    });

  } catch (err) {
    console.error("delete-all-orders error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete orders",
    });
  }
});


module.exports = router;
