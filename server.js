require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/errorHandler");

const app = express();

/* ================================================
   ✅ TRUST PROXY — MUST BE FIRST
================================================ */
app.set("trust proxy", 1);  // Proxy chain (Render/NGINX/Cloudflare)

/* ================================================
   ✅ CONNECT DATABASE
================================================ */
connectDB();

/* ================================================
   ✅ SECURITY & BASIC MIDDLEWARE
================================================ */
app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static("uploads"));

/* ================================================
   ✅ GLOBAL REQUEST LOGGER
================================================ */
app.use((req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    req.ip;

  console.log(
    `📡 [${new Date().toISOString()}] ${req.method} ${req.originalUrl} — IP: ${ip}`
  );
  next();
});

/* ================================================
   ✅ CORS CONFIGURATION
================================================ */
const allowedOrigins = [
  "http://localhost:3000",
  "http://192.168.0.110:3000",
  "http://192.168.0.110",
  "http://192.168.0.215:3000",
  "http://localhost:3001",
  "http://192.168.0.215:3001",
  "http://192.168.0.110:3001",
  process.env.FRONTEND_URL,
  "https://kzarre-frontend.vercel.app",
  "https://kzarre-admin.vercel.app",
  "https://app.kzarre.com",
  "https://admin.kzarre.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      const domainRegex = /^https:\/\/([a-z0-9-]+\.)*kzarre\.com$/;
      if (domainRegex.test(origin)) return callback(null, true);

      console.warn(`🚫 CORS blocked from: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

app.options(/.*/, cors());

/* ================================================
   ✅ RATE LIMITER (FIXED)
================================================ */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "Too many requests from this IP. Please try again later.",
  validate: { xForwardedForHeader: false }, // 🔥 FIXED
});
app.use(limiter);

/* ================================================
   ✅ ROUTES
================================================ */
app.use("/api/superadmin", require("./routes/superAdmin"));
app.use("/api/cms-content", require("./routes/cmsRoutes"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/product"));
app.use("/api/usersadmin", require("./routes/adminUserRoutes"));

/* ================================================
   ✅ ROOT TEST ROUTE
================================================ */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "KZARRÈ E-Commerce Backend API",
    version: "1.0.0",
    message: "Customer API running successfully 🚀",
  });
});

/* ================================================
   ✅ GLOBAL ERROR HANDLER
================================================ */
app.use(errorHandler);

/* ================================================
   ✅ START SERVER
================================================ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 Allowed Origins:`);
  allowedOrigins.forEach((url) => url && console.log("   →", url));
  console.log("🚀 Ready to accept requests...\n");
});
