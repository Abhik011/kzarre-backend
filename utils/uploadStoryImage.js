const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");

// Only initialize S3 if AWS credentials are available
let uploadStoryImage;

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_BUCKET_NAME) {
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  uploadStoryImage = multer({
    storage: multerS3({
      s3,
      bucket: process.env.AWS_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: (req, file, cb) => {
        cb(null, { fieldName: file.fieldname });
      },
      key: (req, file, cb) => {
        const ext = file.originalname.split(".").pop();
        cb(
          null,
          `stories/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.${ext}`
        );
      },
    }),
  });
} else {
  // Fallback to local storage if AWS is not configured
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      cb(null, `stories/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    },
  });

  uploadStoryImage = multer({ storage });
}

module.exports = uploadStoryImage;
