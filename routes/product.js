const express = require("express");
const router = express.Router();
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const path = require("path");
const Product = require("../models/product");

// ==================================================
// 🔧 VARIANT HELPERS (CRITICAL FIX)
// ==================================================
const normalizeVariants = (variants = []) => {
  return variants.map(v => ({
    size: v.size?.trim(),
    color: v.color?.trim(),
    stock: Number(v.stock || 0),
    price: v.price ? Number(v.price) : undefined,
  }));
};

const calculateStockQuantity = (variants = []) => {
  return variants.reduce(
    (sum, v) => sum + Number(v.stock || 0),
    0
  );
};

// ==================================================
// AWS CONFIG
// ==================================================
const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/jpg",
  "image/heic"
];

const fileFilter = (req, file, cb) => {
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only image files allowed"), false);
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
// MULTER CONFIG
// ==================================================
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ==================================================
// SAFE JSON
// ==================================================
const safeJSON = (val, fallback = []) => {
  try {
    return JSON.parse(val || "[]");
  } catch {
    return fallback;
  }
};

// ==================================================
// S3 UPLOAD
// ==================================================
async function uploadToS3(file) {
  const fileName = `products/${crypto.randomBytes(8).toString("hex")}${path.extname(
    file.originalname
  )}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

// ==================================================
// 🚀 BULK UPLOAD (FIXED)
// ==================================================
router.post("/upload/bulk", upload.array("images", 20), async (req, res) => {
  try {
    const parsedProducts = safeJSON(req.body.products, []);
    if (!parsedProducts.length) {
      return res.status(400).json({ success: false, message: "No product data" });
    }

    const imageUrls = await Promise.all(req.files.map(uploadToS3));
    const saved = [];

    parsedProducts.forEach((p, index) => {
      const normalizedVariants = normalizeVariants(p.variants || []);

      saved.push(
        new Product({
          name: p.name,
          description: p.description,
          price: p.price,
          category: p.category,
          vendor: p.vendor,

          tags: p.tags || [],
          gender: p.gender || [],

          variants: normalizedVariants,
          stockQuantity: calculateStockQuantity(normalizedVariants),

          imageUrl: imageUrls[index] || imageUrls[0],
          gallery: imageUrls.slice(index * 2, index * 2 + 2),

          notes: p.notes || "",
          terms: p.terms || "",
          materialDetails: p.materialDetails || "",
          careInstructions: p.careInstructions || "",
          highlights: p.highlights || "",

          specifications: p.specifications || {},
          faq: p.faq || [],
          customerPhotos: p.customerPhotos || [],
          uploadedBy: null,
        })
      );
    });

    await Product.insertMany(saved);

    res.status(201).json({
      success: true,
      message: `Uploaded ${saved.length} products`,
      products: saved,
    });
  } catch (err) {
    console.error("Bulk upload error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================================================
// 🚀 CREATE / EDIT PRODUCT (FIXED)
// ==================================================
router.post(
  "/upload",
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "customerPhotos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        category,
        vendor,
        tags,
        gender,
        variants,
        highlights,
        materialDetails,
        careInstructions,
        notes,
        terms,
        specifications,
        faq,
        existingGallery,
        existingCustomerPhotos,
        productId,
      } = req.body;

      if (!name || !category || !price) {
        return res.status(400).json({ success: false, message: "Missing fields" });
      }

      const parsedVariants = safeJSON(variants, []);
      const normalizedVariants = normalizeVariants(parsedVariants);
      const stockQuantity = calculateStockQuantity(normalizedVariants);

      const oldGallery = safeJSON(existingGallery, []);
      const oldCustomerPhotos = safeJSON(existingCustomerPhotos, []);

      let newGallery = [];
      if (req.files?.images) {
        newGallery = await Promise.all(req.files.images.map(uploadToS3));
      }

      let newCustomerPhotos = [];
      if (req.files?.customerPhotos) {
        newCustomerPhotos = await Promise.all(req.files.customerPhotos.map(uploadToS3));
      }

      const finalGallery = [...oldGallery, ...newGallery];
      const finalCustomerPhotos = [...oldCustomerPhotos, ...newCustomerPhotos];

      // ✏️ EDIT
      if (productId) {
        const product = await Product.findByIdAndUpdate(
          productId,
          {
            name,
            description,
            price,
            category,
            vendor,
            tags: safeJSON(tags),
            gender: safeJSON(gender),

            variants: normalizedVariants,
            stockQuantity,

            highlights,
            materialDetails,
            careInstructions,
            notes,
            terms,
            specifications: safeJSON(specifications),
            faq: safeJSON(faq),

            imageUrl: finalGallery[0] || "",
            gallery: finalGallery,
            customerPhotos: finalCustomerPhotos,
          },
          { new: true }
        );

        return res.json({ success: true, product });
      }

      // ➕ CREATE
      const product = new Product({
        name,
        description,
        price,
        category,
        vendor,
        tags: safeJSON(tags),
        gender: safeJSON(gender),

        variants: normalizedVariants,
        stockQuantity,

        highlights,
        materialDetails,
        careInstructions,
        notes,
        terms,
        specifications: safeJSON(specifications),
        faq: safeJSON(faq),

        imageUrl: finalGallery[0],
        gallery: finalGallery,
        customerPhotos: finalCustomerPhotos,
        uploadedBy: null,
      });

      await product.save();

      res.status(201).json({ success: true, product });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ==================================================
// 🚀 GET PRODUCTS
// ==================================================
router.get("/", async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json({ success: true, products });
});

router.get("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false });
  res.json({ success: true, product });
});

router.delete("/:id", async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
