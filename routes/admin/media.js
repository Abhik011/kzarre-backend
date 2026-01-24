const express = require("express");
const router = express.Router();
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");
const path = require("path");
require("dotenv").config();

/* ================= AWS CLIENT ================= */

let upload;

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_BUCKET_NAME) {
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  /* ================= MULTER ================= */

  upload = multer({
    storage: multerS3({
      s3,
      bucket: process.env.AWS_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,

      // ❌ DO NOT SET ACL (bucket blocks it)

      key: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(
          null,
          `email-assets/${Date.now()}-${Math.round(
            Math.random() * 1e9
          )}${ext}`
        );
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });
} else {
  // Fallback to local storage if AWS is not configured
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `email-assets/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });
}

/* ================= ROUTE ================= */

router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Upload failed - no file provided" });
  }

  // Handle both AWS S3 (location) and local storage (path/filename)
  const fileUrl = req.file.location || `/uploads/${req.file.filename || req.file.path}`;

  res.json({
    url: fileUrl, // Works for both S3 and local storage
    key: req.file.key || req.file.filename, // Fallback for local storage
  });
});

module.exports = router;
