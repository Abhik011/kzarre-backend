const express = require("express");
const router = express.Router();
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const CMSContent = require("../models/CMSContent");
require("dotenv").config();

// =============================
// 🔹 AWS S3 Setup
// =============================
console.log("🧩 AWS ENV CHECK:", {
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ? "✅ Loaded" : "❌ Missing",
  secretKey: process.env.AWS_SECRET_ACCESS_KEY ? "✅ Loaded" : "❌ Missing",
  bucket: process.env.AWS_BUCKET_NAME,
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// =============================
// 🔹 Multer Config (in-memory)
// =============================
const storage = multer.memoryStorage();
const upload = multer({ storage }); // ✅ Do NOT call .any() here

const uploadToS3 = async (file, displayTo) => {
  try {
    let folder = "cms/others";
    if (displayTo === "home-landing-video") folder = "cms/videos";
    else if (displayTo === "home-banner") folder = "cms/images/banners";
    else if (displayTo === "post") folder = "cms/images/posts";
    else if (displayTo === "about-page") folder = "cms/images/about";
    else if (displayTo === "product-page") folder = "cms/images/products";

    const fileName = `${crypto.randomBytes(8).toString("hex")}-${file.originalname}`;
    const key = `${folder}/${fileName}`;

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(params));
    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    console.log(`✅ Uploaded to S3: ${fileUrl}`);
    return fileUrl;
  } catch (err) {
    console.error("❌ uploadToS3 Error:", err);
    throw err;
  }
};

// =============================
// ✅ Save CMS Content (Create Post)
// =============================
router.post("/save", upload.any(), async (req, res) => {
  try {
    console.log("🔥 Incoming CMS Upload:");
    console.log("req.files:", req.files?.map((f) => f.originalname) || []);
    console.log("req.body:", req.body);

    const {
      title,
      description,
      displayTo,
      visibleDate,
      visibleTime,
      metaTag,
      metaDescription,
      keywords,
    } = req.body;

    // ✅ Fix: Ensure displayTo value is set
    const displayToValue = displayTo || "others";

    let heroVideoUrl = null;
    let banners = [];
    let media = {};

    // ====================================================
    // ✅ Handle Media Uploads (Video or Images)
    // ====================================================
    const videoFile = req.files?.find((f) => f.mimetype.startsWith("video/"));
    const imageFiles = req.files?.filter((f) => f.mimetype.startsWith("image/"));

    if (videoFile) {
      heroVideoUrl = await uploadToS3(videoFile, displayToValue);
      console.log("🎥 Uploaded Video:", heroVideoUrl);

      media = {
        url: heroVideoUrl,
        name: videoFile.originalname,
        kind: "video",
        displayTo: displayToValue,
      };
    }

    if (imageFiles && imageFiles.length > 0) {
      banners = await Promise.all(
        imageFiles.map(async (file, index) => ({
          imageUrl: await uploadToS3(file, displayToValue),
          order: index + 1,
        }))
      );

      console.log("🖼️ Uploaded Banners:", banners);

      // ✅ If single banner, use as main media
      if (banners.length === 1) {
        media = {
          url: banners[0].imageUrl,
          name: imageFiles[0].originalname,
          kind: "image",
          displayTo: displayToValue,
        };
      }
    }

    // ====================================================
    // ✅ Save to MongoDB
    // ====================================================
    const cmsContent = new CMSContent({
      title,
      description,
      displayTo: displayToValue,
      heroVideoUrl,
      banners,
      media,
      meta: {
        tag: metaTag,
        description: metaDescription,
        keywords,
        visibleDate,
        visibleTime,
      },
      author: "Admin",
      status: "Pending Review",
    });

    await cmsContent.save();

    console.log("🟢 CMS content saved (Pending Review):", cmsContent._id);
    res.status(200).json({
      success: true,
      message: "CMS content saved successfully (Pending Review)",
      cmsContent,
    });
  } catch (err) {
    console.error("❌ CMS Upload Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================
// ✅ Get All CMS (Admin Panel)
// =============================
router.get("/", async (req, res) => {
  try {
    const cmsContent = await CMSContent.find().sort({ createdAt: -1 });
    res.status(200).json(cmsContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================
// ✅ Get Public CMS (Frontend)
// =============================
router.get("/public", async (req, res) => {
  try {
    const cmsContent = await CMSContent.find({
      status: "Approved",
      displayTo: "home-landing-video",
    }).sort({ updatedAt: -1 });

    res.status(200).json(cmsContent[0] || {});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================
// ✅ Approve / Reject (Admin Only)
// =============================
router.patch("/approve/:id", async (req, res) => {
  try {
    const post = await CMSContent.findByIdAndUpdate(
      req.params.id,
      { status: "Approved", updatedAt: new Date() },
      { new: true }
    );
    if (!post) return res.status(404).json({ message: "Post not found" });
    console.log("✅ Post Approved:", post._id);
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/reject/:id", async (req, res) => {
  try {
    const { reason } = req.body;
    const post = await CMSContent.findByIdAndUpdate(
      req.params.id,
      {
        status: "Rejected",
        rejectionReason: reason || "No reason provided",
        updatedAt: new Date(),
      },
      { new: true }
    );
    if (!post) return res.status(404).json({ message: "Post not found" });
    console.log("❌ Post Rejected:", post._id);
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
