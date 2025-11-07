const express = require("express");
const router = express.Router();
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const path = require("path");
const Product = require("../models/Product");

// ==================================================
// ✅ AWS CONFIG
// ==================================================
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/jpg",
    "image/heic"
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    console.warn(`⚠️ File rejected: ${file.originalname} (${file.mimetype})`);
    return cb(new Error("Only image files are allowed"), false);
  }

  cb(null, true);
};


const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ==================================================
// ✅ MULTER CONFIG
// ==================================================
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ==================================================
// ✅ SAFE JSON PARSER
// ==================================================
const safeJSON = (value, fallback = []) => {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return fallback;
  }
};

// ==================================================
// ✅ BULK PRODUCT UPLOAD
// ==================================================
router.post("/upload/bulk", upload.array("images", 20), async (req, res) => {
  console.log("🔥 /api/products/upload/bulk hit");

  try {
    const { products } = req.body;

    // Step 1: Parse incoming products
    const parsedProducts = safeJSON(products, []);
    if (!parsedProducts.length) {
      return res.status(400).json({ success: false, message: "No product data provided" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No images uploaded" });
    }

    console.log(`📦 Received ${parsedProducts.length} products and ${req.files.length} images`);

    // Step 2: Upload images to S3
    const imageUrls = [];
    for (const file of req.files) {
      const fileName = `products/${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };
      await s3.send(new PutObjectCommand(params));
      const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
      imageUrls.push(imageUrl);
    }

    console.log("✅ Uploaded images to S3:", imageUrls.length);

    // Step 3: Save each product
    const savedProducts = [];
    parsedProducts.forEach((productData, index) => {
      const product = new Product({
        name: productData.name,
        description: productData.description,
        price: productData.price,
        category: productData.category,
        vendor: productData.vendor,
        tags: productData.tags || [],
        gender: productData.gender || [],
        variants: productData.variants || [],
        imageUrl: imageUrls[index] || imageUrls[0],
        gallery: imageUrls.slice(index * 2, index * 2 + 2), // 2 images per product example
        uploadedBy: null,
      });
      savedProducts.push(product);
    });

    await Product.insertMany(savedProducts);

    console.log(`🛍️ Saved ${savedProducts.length} products to MongoDB`);

    return res.status(201).json({
      success: true,
      message: `✅ Uploaded ${savedProducts.length} products successfully`,
      products: savedProducts,
    });
  } catch (error) {
    console.error("❌ Bulk upload failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error during bulk upload",
      error: error.message,
    });
  }
});
// ==================================================
// ✅ SINGLE PRODUCT UPLOAD (for Admin Panel)
// ==================================================
router.post("/upload", upload.array("images", 5), async (req, res) => {
  console.log("🔥 /api/products/upload hit (single)");

  try {
    const { name, description, price, category, vendor, tags, gender, variants } = req.body;

    // Validation
    if (!name || !category || !price) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, category, or price",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files provided",
      });
    }

    console.log(`📸 Uploading ${req.files.length} images for product: ${name}`);

    // Upload to S3
    const imageUrls = [];
    for (const file of req.files) {
      const fileName = `products/${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      await s3.send(new PutObjectCommand(params));
      const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
      imageUrls.push(imageUrl);
    }

    console.log("✅ Uploaded images to S3:", imageUrls.length);

    // Save in DB
    const product = new Product({
      name,
      description,
      price,
      category,
      vendor,
      tags: safeJSON(tags),
      gender: safeJSON(gender),
      variants: safeJSON(variants),
      imageUrl: imageUrls[0],
      gallery: imageUrls,
      uploadedBy: null,
    });

    await product.save();

    console.log(`🛍️ Saved product: ${product.name}`);

    res.status(201).json({
      success: true,
      message: "✅ Product uploaded successfully",
      product,
    });
  } catch (error) {
    console.error("❌ Single product upload failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during product upload",
      error: error.message,
    });
  }
});
// ==================================================
// ✅ GET ALL PRODUCTS (For Inventory Page)
// ==================================================
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("❌ Failed to fetch products:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
      error: error.message,
    });
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("❌ Delete failed:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});



module.exports = router;