const express = require("express");
const router = express.Router();
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const CMSContent = require("../models/CMSContent");
require("dotenv").config();
const CMSFont = require("../models/CMSFont");
const { DateTime } = require("luxon");
const BRAND_TIMEZONE = "America/New_York"; // ✅ New Jersey
const Product = require("../models/product");
const { sendNotification } = require("../utils/notify");
const compressVideo = require("../utils/compressVideo");
const compressImage = require("../utils/compressImage");




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

const fs = require("fs");
const path = require("path");
const os = require("os");

const uploadToS3 = async (file, displayTo = "") => {

try {
    let folder = "cms/others";
    if (displayTo.includes("video")) folder = "cms/videos";
    else if (displayTo.includes("grid") || displayTo.includes("banner"))
      folder = "cms/images";
    else if (displayTo === "post") folder = "cms/images/posts";
    else if (displayTo === "about-page") folder = "cms/images/about";
    else if (displayTo === "product-page") folder = "cms/images/products";

    let buffer = file.buffer;
    let contentType = file.mimetype;

if (file.mimetype.startsWith("image/")) {
  buffer = await compressImage(file.buffer, file.mimetype);
  contentType = "image/webp";
}

    if (file.mimetype.startsWith("video/")) {
      const tempDir = os.tmpdir();
      const inputPath = path.join(
        tempDir,
        `${Date.now()}-${file.originalname}`
      );
      const outputPath = path.join(
  tempDir,
  `${Date.now()}-compressed.mp4`
);


      fs.writeFileSync(inputPath, file.buffer);

      await compressVideo(inputPath, outputPath);

      buffer = fs.readFileSync(outputPath);
      contentType = "video/mp4";

      // cleanup
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    }

    const fileName = `${crypto.randomBytes(8).toString("hex")}-${file.originalname}`;
    const key = `${folder}/${fileName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,

        // 🚀 VERY IMPORTANT FOR SPEED
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    console.log("✅ Optimized upload:", fileUrl);
    return fileUrl;
  } catch (err) {
    console.error("❌ uploadToS3 Error:", err);
    throw err;
  }
};


router.post("/save", upload.any(), async (req, res) => {
  try {
    const {
      title,
      description,
      displayTo,
      visibleDate,
      visibleTime,
      metaTag,
      metaDescription,
      keywords,
      titles,
      descriptions,
      metaTags,
      metaDescriptions,
      keywords: perImageKeywords,
    } = req.body;

    const displayToValue = displayTo || "";

    // -----------------------------
    // FIX KEYWORDS (meta.keywords)
    // Always convert to string
    // -----------------------------
    let cleanKeywords = keywords;
    try {
      const parsed = JSON.parse(keywords);
      cleanKeywords = Array.isArray(parsed) ? parsed.join(",") : keywords;
    } catch {
      cleanKeywords = keywords; // if not JSON, keep as string
    }

    // -----------------------------
    // Files
    // -----------------------------
    const videoFile = req.files?.find((f) => f.mimetype.startsWith("video/"));
    const imageFiles = req.files?.filter((f) =>
      f.mimetype.startsWith("image/")
    );

    let heroVideoUrl = null;
    let media = null;
    let mediaGroup = [];

    // NEW: Banner Styling
    let parsedBannerStyle = {};
    if (req.body.bannerStyle) {
      try {
        parsedBannerStyle = JSON.parse(req.body.bannerStyle);
      } catch (err) {
        console.log("❌ Invalid bannerStyle JSON:", err);
      }
    }

    // ============================================
    // 1️⃣ Home Landing Video
    // ============================================
    if (
      displayToValue === "home-landing-video" ||
      displayToValue === "men-page-video" ||
      displayToValue === "women-page-video" ||
      displayToValue === "accessories-video" ||
      displayToValue === "heritage-video"
    ) {
      if (!videoFile)
        return res.status(400).json({ error: "Video required for landing" });

      heroVideoUrl = await uploadToS3(videoFile, displayToValue);

      media = {
        url: heroVideoUrl,
        name: videoFile.originalname,
        kind: "video",
        displayTo: displayToValue,
      };
    }

    // ============================================
    // 2️⃣ Single Banners (1 image)
    // ============================================
    else if (["bannerOne", "bannerTwo"].includes(displayToValue)) {
      if (!imageFiles || imageFiles.length !== 1)
        return res.status(400).json({ error: "Exactly 1 image required" });

      const url = await uploadToS3(imageFiles[0], displayToValue);

      const { title, description } = req.body; // ⬅️ added

      media = {
        url,
        name: imageFiles[0].originalname,
        kind: "image",
        displayTo: displayToValue,
        title, // ⬅️ added
        description, // ⬅️ added
      };
    }

    // ============================================
    // 3️⃣ Women / Men 4-Grid (EXACT 4 images)
    // ============================================
    else if (["women-4grid", "men-4grid"].includes(displayToValue)) {
      if (!imageFiles || imageFiles.length !== 4)
        return res.status(400).json({ error: "Requires EXACTLY 4 images" });

      mediaGroup = await Promise.all(
        imageFiles.map(async (file, i) => ({
          imageUrl: await uploadToS3(file, displayToValue),
          title: `Grid Item ${i + 1}`, // ⭐ AUTO TITLE
          description: `Description ${i + 1}`, // ⭐ AUTO DESCRIPTION
          metaTag: "",
          metaDescription: "",
          keywords: "",
          order: i + 1,
          style: parsedBannerStyle
        }))
      );
    }

    // ============================================
    // 4️⃣ Women / Men 5-Grid (EXACT 5 images + metadata)
    // ============================================
    else if (["women-grid", "men-grid"].includes(displayToValue)) {
      if (!imageFiles || imageFiles.length !== 5)
        return res.status(400).json({ error: "Requires EXACTLY 5 images" });

      const arrTitles = JSON.parse(req.body.titles || "[]");
      const arrDescriptions = JSON.parse(req.body.descriptions || "[]");
      const arrMetaTags = JSON.parse(req.body.metaTags || "[]");
      const arrMetaDescriptions = JSON.parse(req.body.metaDescriptions || "[]");

      // keywords safe parse
      let arrKeywords = [];
      try {
        const parsed = JSON.parse(req.body.keywords || "[]");
        arrKeywords = Array.isArray(parsed) ? parsed : [];
      } catch {
        arrKeywords = [];
      }

      mediaGroup = await Promise.all(
        imageFiles.map(async (file, i) => ({
          imageUrl: await uploadToS3(file, displayToValue),
          title: arrTitles[i] || `Grid Item ${i + 1}`, // ⭐ auto fallback
          description: arrDescriptions[i] || `Description ${i + 1}`, // ⭐ auto fallback
          metaTag: arrMetaTags[i] || "",
          metaDescription: arrMetaDescriptions[i] || "",
          keywords: Array.isArray(arrKeywords[i])
            ? arrKeywords[i].join(",")
            : arrKeywords[i] || "",
          order: i + 1,
          style: parsedBannerStyle
        }))
      );
    }

    // ============================================
    // 5️⃣ Blog Post (single image)
    // ============================================
    else if (displayToValue === "post") {
      if (!imageFiles || imageFiles.length !== 1)
        return res.status(400).json({ error: "Post requires 1 image" });

      const url = await uploadToS3(imageFiles[0], displayToValue);

      media = {
        url,
        name: imageFiles[0].originalname,
        kind: "image",
        displayTo: displayToValue,
      };
    }

    let visibleAt = null;

    if (visibleDate && visibleTime) {
      visibleAt = DateTime.fromISO(
        `${visibleDate}T${visibleTime}`,
        { zone: BRAND_TIMEZONE }
      )
        .toUTC()
        .toJSDate();
    }

    const saved = await CMSContent.create({
      title,
      description,
      displayTo: displayToValue,
      heroVideoUrl,
      media,
      mediaGroup,

      bannerStyle: parsedBannerStyle,

      // ✅ NEW
      visibleAt,
      timezone: BRAND_TIMEZONE,

      meta: {
        tag: metaTag,
        description: metaDescription,
        keywords: cleanKeywords,
        visibleDate,
        visibleTime,
      },

      author: "Admin",

      // ✅ AUTO STATUS
      status: visibleAt && visibleAt > new Date()
        ? "Scheduled"
        : "Pending Review",
    });
    // 🔔 SEND CMS NOTIFICATION

    if (saved.status === "Scheduled") {
      sendNotification({
        type: "cms-scheduled",
        title: "Content Scheduled",
        message: `CMS content "${saved.title}" scheduled for ${visibleDate} ${visibleTime} (New Jersey time)`,
        cmsId: saved._id,
        displayTo: saved.displayTo,
        visibleAt: saved.visibleAt,
      });
    } else {
      sendNotification({
        type: "cms-submitted",
        title: "Content Submitted",
        message: `CMS content "${saved.title}" submitted for review`,
        cmsId: saved._id,
        displayTo: saved.displayTo,
      });
    }
    res.json({ success: true, message: "Saved (Pending Review)", saved });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const cmsContent = await CMSContent.find().sort({ createdAt: -1 });
    res.status(200).json(cmsContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/similar/:id", async (req, res) => {
  try {
    const current = await Product.findById(req.params.id);
    if (!current) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const similar = await Product.find({
      _id: { $ne: current._id },
      category: current.category,
    })
      .limit(10)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: similar.length,
      products: similar,
    });
  } catch (err) {
    console.error("Similar products error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// =============================
// ✅ Get Public CMS (Frontend)
// =============================
router.get("/public", async (req, res) => {
  try {
    const now = new Date();

    const all = await CMSContent.find({
      $or: [
        { status: "Approved" },
        {
          status: "Scheduled",
          visibleAt: { $lte: now }
        }
      ]
    });

    const allFonts = await CMSFont.find();

    const response = {
      heroVideoUrl: null,
      menPageVideoUrl: null,
      womenPageVideoUrl: null,
      accessoriesVideoUrl: null,
      heritageVideoUrl: null,

      banners: {
        bannerOne: null,
        bannerTwo: null,
      },

      women4Grid: [],
      men4Grid: [],
      womenGrid: [],
      menGrid: [],

      bannerCarousel: [],
      posts: [],
      fonts: [],
    };

    all.forEach((item) => {
      // -----------------------------
      // VIDEOS
      // -----------------------------
      if (item.displayTo === "home-landing-video")
        response.heroVideoUrl = item.media?.url;

      if (item.displayTo === "men-page-video")
        response.menPageVideoUrl = item.media?.url;

      if (item.displayTo === "women-page-video")
        response.womenPageVideoUrl = item.media?.url;

      if (item.displayTo === "accessories-video")
        response.accessoriesVideoUrl = item.media?.url;

      if (item.displayTo === "heritage-video")
        response.heritageVideoUrl = item.media?.url;

      // -----------------------------
      // BANNERS
      // -----------------------------
      if (item.displayTo === "bannerOne")
        response.banners.bannerOne = {
          image: item.media?.url,
          title: item.media?.title || item.title || "",
          description: item.media?.description || item.description || "",
          style: item.bannerStyle || {},
        };

      if (item.displayTo === "bannerTwo")
        response.banners.bannerTwo = {
          image: item.media?.url,
          title: item.media?.title || item.title || "",
          description: item.media?.description || item.description || "",
          style: item.bannerStyle || {},
        };

      // -----------------------------
      // WOMEN 4 GRID
      // -----------------------------
      if (item.displayTo === "women-4grid")
        response.women4Grid = item.mediaGroup
          ?.sort((a, b) => a.order - b.order)
          ?.map((g) => ({
            ...g,
            style: g.style || item.bannerStyle || {},
          }));

      // -----------------------------
      // MEN 4 GRID
      // -----------------------------
      if (item.displayTo === "men-4grid")
        response.men4Grid = item.mediaGroup
          ?.sort((a, b) => a.order - b.order)
          ?.map((g) => ({
            ...g,
            style: g.style || item.bannerStyle || {},
          }));

      // -----------------------------
      // WOMEN 5 GRID
      // -----------------------------
      if (item.displayTo === "women-grid")
        response.womenGrid = item.mediaGroup
          ?.sort((a, b) => a.order - b.order)
          ?.map((g) => ({
            ...g,
            style: g.style || item.bannerStyle || {},
          }));

      // -----------------------------
      // MEN 5 GRID
      // -----------------------------
      if (item.displayTo === "men-grid")
        response.menGrid = item.mediaGroup
          ?.sort((a, b) => a.order - b.order)
          ?.map((g) => ({
            ...g,
            style: g.style || item.bannerStyle || {},
          }));

      // -----------------------------
      // BANNER CAROUSEL
      // -----------------------------
      if (item.displayTo === "home-banner-carousel")
        response.bannerCarousel.push(
          ...(item.mediaGroup || []).map((m) => m.imageUrl)
        );

      // -----------------------------
      // POSTS
      // -----------------------------
      if (item.displayTo === "post")
        response.posts.push({
          title: item.title,
          description: item.description,
          media: item.media,
        });
    });

    // -----------------------------
    // FONTS
    // -----------------------------
    response.fonts = allFonts.map((f) => ({
      name: f.fontName,
      url: f.fontUrl,
      weight: f.fontWeight,
      style: f.fontStyle,
    }));


    return res.json(response);



  } catch (err) {
    console.error("❌ Public CMS Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


router.get("/fonts", async (req, res) => {
  try {
    const fonts = await CMSFont.find().sort({ createdAt: -1 });
    res.json({ success: true, fonts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/upload-font", upload.single("font"), async (req, res) => {
  try {
    const file = req.file;

    if (!file)
      return res.status(400).json({ error: "Font file is required" });

    const fontName = req.body.fontName;
    const fontWeight = req.body.fontWeight || "400";
    const fontStyle = req.body.fontStyle || "normal";

    if (!fontName)
      return res.status(400).json({ error: "Font name is required" });

    // Upload font to S3
    const fontUrl = await uploadToS3(file, "fonts");

    const saved = await CMSFont.create({
      fontName,
      fontUrl,
      fontWeight,
      fontStyle,
    });

    res.json({ success: true, font: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.get("/:id", async (req, res) => {
  try {
    const item = await CMSContent.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: "CMS content not found" });
    }

    res.json(item);
  } catch (err) {
    console.error("GET CMS Content Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/update/:id", upload.any(), async (req, res) => {
  try {
    const existing = await CMSContent.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Content not found" });

    const prevStatus = existing.status; // ✅ ADD THIS


    /* ===============================
       BASIC FIELDS
    =============================== */
    existing.title = req.body.title ?? existing.title;
    existing.description = req.body.description ?? existing.description;
    const displayTo = req.body.displayTo ?? existing.displayTo;
    existing.displayTo = displayTo;


    /* ===============================
       META
    =============================== */
    existing.meta = {
      tag: req.body.metaTag ?? existing.meta?.tag,
      description: req.body.metaDescription ?? existing.meta?.description,
      keywords: req.body.keywords ?? existing.meta?.keywords,
      visibleDate: req.body.visibleDate ?? existing.meta?.visibleDate,
      visibleTime: req.body.visibleTime ?? existing.meta?.visibleTime,
    };
    /* ===============================
   ⏰ TIMEZONE SCHEDULING (NEW JERSEY)
=============================== */
    if (req.body.visibleDate && req.body.visibleTime) {
      existing.visibleAt = DateTime.fromISO(
        `${req.body.visibleDate}T${req.body.visibleTime}`,
        { zone: BRAND_TIMEZONE }
      )
        .toUTC()        // always store UTC
        .toJSDate();

      existing.timezone = BRAND_TIMEZONE;

      // Auto schedule if future time
      if (existing.visibleAt > new Date()) {
        existing.status = "Scheduled";
      }
    }
    if (!req.body.visibleDate || !req.body.visibleTime) {
      existing.visibleAt = null;

      if (existing.status === "Scheduled") {
        existing.status = "Pending Review";
      }
    }


    if (req.body.bannerStyle) {
      try {
        existing.bannerStyle = JSON.parse(req.body.bannerStyle);
      } catch { }
    }

    /* ===============================
       FILES
    =============================== */
    const files = req.files || [];

    const imageFiles = files.filter(f => f.mimetype.startsWith("image/"));
    const videoFile = files.find(f => f.mimetype.startsWith("video/"));

    /* ===============================
       VIDEO UPDATE
    =============================== */
    if (videoFile) {
      const videoUrl = await uploadToS3(videoFile, existing.displayTo);

      existing.media = {
        url: videoUrl,
        name: videoFile.originalname,
        kind: "video",
        displayTo: existing.displayTo,
      };

      existing.heroVideoUrl = videoUrl;
    }

    /* ===============================
       SINGLE IMAGE UPDATE
    =============================== */
    if (
      imageFiles.length === 1 &&
      !["women-4grid", "men-4grid", "women-grid", "men-grid", "home-banner-carousel"].includes(existing.displayTo)
    ) {
      const imgUrl = await uploadToS3(imageFiles[0], existing.displayTo);

      existing.media = {
        url: imgUrl,
        name: imageFiles[0].originalname,
        kind: "image",
        displayTo: existing.displayTo,
      };
    }

    /* ===============================
       GRID / CAROUSEL UPDATE
    =============================== */
    if (imageFiles.length > 1) {
      const titles = JSON.parse(req.body.titles || "[]");
      const descriptions = JSON.parse(req.body.descriptions || "[]");
      const metaTags = JSON.parse(req.body.metaTags || "[]");
      const metaDescriptions = JSON.parse(req.body.metaDescriptions || "[]");
      const keywords = JSON.parse(req.body.imageKeywords || "[]");

      existing.mediaGroup = await Promise.all(
        imageFiles.map(async (file, i) => ({
          imageUrl: await uploadToS3(file, existing.displayTo),
          title: titles[i] || "",
          description: descriptions[i] || "",
          metaTag: metaTags[i] || "",
          metaDescription: metaDescriptions[i] || "",
          keywords: keywords[i] || "",
          order: i + 1,
          style: existing.bannerStyle || {},
        }))
      );
    }

    /* ===============================
       KEEP EXISTING FILES (NO REUPLOAD)
    =============================== */
    if (!files.length && req.body.existingFiles) {
      const urls = Array.isArray(req.body.existingFiles)
        ? req.body.existingFiles
        : [req.body.existingFiles];

      existing.mediaGroup = urls.map((url, i) => ({
        imageUrl: url,
        order: i + 1,
        style: existing.bannerStyle || {},
      }));
    }

    // 🔔 CMS SCHEDULING NOTIFICATION
    


    await existing.save();
if (prevStatus !== "Scheduled" && existing.status === "Scheduled") {
      sendNotification({
        type: "cms-scheduled",
        title: "Content Scheduled",
        message: `CMS content "${existing.title}" scheduled for ${req.body.visibleDate} ${req.body.visibleTime} (New Jersey time)`,
        cmsId: existing._id,
        displayTo: existing.displayTo,
        visibleAt: existing.visibleAt,
      });
    }

    if (prevStatus === "Scheduled" && existing.status !== "Scheduled") {
      sendNotification({
        type: "cms-unscheduled",
        title: "Content Schedule Removed",
        message: `CMS content "${existing.title}" schedule was removed`,
        cmsId: existing._id,
      });
    }
    res.json({ success: true, updated: existing });
  } catch (err) {
    console.error("UPDATE CMS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const deleted = await CMSContent.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Content not found" });
    }

    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE CMS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
