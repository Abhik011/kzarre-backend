const Cart = require("../models/Cart");
const Product = require("../models/product"); // ✅ REQUIRED

// ✅ GET USER CART
exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      return res.json({ items: [] });
    }

    res.json(cart);
  } catch (err) {
    console.error("GET CART ERROR:", err);
    res.status(500).json({ message: "Failed to fetch cart" });
  }
};

// ✅ ✅ ✅ ADD TO CART (FIXED IMAGE STORAGE)
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, size = "M" } = req.body;

    // ✅ ALWAYS FETCH PRODUCT FROM DB
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      cart = new Cart({
        userId: req.user._id,
        items: [],
      });
    }

    const existingItem = cart.items.find(
      (item) =>
        item.productId.toString() === productId &&
        item.size === size
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        productId: product._id,
        name: product.name,

        // ✅ ✅ ✅ FIX: pull image from product.imageUrl
        image: product.imageUrl,

        price:
          product.discountPrice > 0
            ? product.discountPrice
            : product.price,

        quantity,
        size,
      });
    }

    await cart.save();

    res.json({
      success: true,
      message: "Product added to cart",
      cart,
    });
  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    res.status(500).json({ message: "Failed to add to cart" });
  }
};

// ✅ UPDATE CART QUANTITY
exports.updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    if (!item) return res.status(404).json({ message: "Item not found" });

    item.quantity = quantity;
    await cart.save();

    res.json(cart);
  } catch (err) {
    console.error("UPDATE CART ERROR:", err);
    res.status(500).json({ message: "Failed to update cart" });
  }
};

// ✅ REMOVE CART ITEM
exports.removeCartItem = async (req, res) => {
  try {
    const { id } = req.params;

    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== id
    );

    await cart.save();
    res.json(cart);
  } catch (err) {
    console.error("REMOVE ITEM ERROR:", err);
    res.status(500).json({ message: "Failed to remove item" });
  }
};

// ✅ CLEAR CART
exports.clearCart = async (req, res) => {
  try {
    await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { items: [] }
    );

    res.json({ message: "Cart cleared" });
  } catch (err) {
    console.error("CLEAR CART ERROR:", err);
    res.status(500).json({ message: "Failed to clear cart" });
  }
};
