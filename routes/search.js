const express = require("express");
const router = express.Router();
const Product = require("../models/product");

// ✅ SMART SEARCH LOGIC
router.get("/", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.json({ products: [] });
    }

    const keyword = q.trim();

    /* ================= ✅ 1. EXACT MATCH FIRST ================= */
    const exactProduct = await Product.findOne({
      name: { $regex: `^${keyword}$`, $options: "i" },
    });

    if (exactProduct) {
      return res.json({
        products: [exactProduct], // ✅ ONLY ONE RESULT
        type: "exact",
      });
    }

    /* ================= ✅ 2. RELATED MATCH IF EXACT NOT FOUND ================= */
    const relatedProducts = await Product.find({
      $or: [
        { name: { $regex: keyword, $options: "i" } },
        { category: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ],
    }).limit(12);

    if (relatedProducts.length > 0) {
      return res.json({
        products: relatedProducts,
        type: "related",
      });
    }

    /* ================= ✅ 3. NOT FOUND ================= */
    return res.json({
      products: [],
      type: "none",
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Search failed" });
  }
});

module.exports = router;
