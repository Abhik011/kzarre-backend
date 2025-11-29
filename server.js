require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit"); // required
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/errorHandler");

const app = express();

// ----------------------------
// DB CONNECT
// ----------------------------
connectDB();

// ----------------------------
// SECURITY + BASE MIDDLEWARE
// ----------------------------
app.use(helmet());
app.use(express.json());
app.use(cookieParser());   // <-- FIXED (must be early)
app.use(morgan("dev"));
app.use("/uploads", express.static("uploads"));

// ----------------------------
// TRUST PROXY (NEEDED FOR IP)
// ----------------------------
app.set("trust proxy", false); // <-- keep this


// ----------------------------
// GLOBAL LOGGER
// ----------------------------
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

// ----------------------------
// CORS
// ----------------------------
const allowedOrigins = [
  "http://localhost:3000",
  "http://192.168.0.110:3000",
  "http://192.168.0.110",
  "http://192.168.0.226:3000",
  "http://192.168.0.226:3001",
  "http://localhost:3001",
  "http://192.168.0.215:3001",
  "http://192.168.0.110:3001",
  process.env.FRONTEND_URL,
  "https://kzarre-frontend.vercel.app",
  "https://kzarre-admin.vercel.app",
  "https://app.kzarre.com",
  "https://admin.kzarre.com",
   "http://kzarre.local:3000",
   "http://kzarre.local:3001",

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
  })
);

app.options(/.*/, cors());

// ----------------------------
// RATE LIMITER
// ----------------------------


const isLocal = process.env.NODE_ENV !== "production";

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isLocal ? 5000 : 200,  // local = unlimited
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

app.use((req, res, next) => {
  if (isLocal) return next();  // disable limiter on local
  return limiter(req, res, next);
});


// ----------------------------
// ROUTES
// ----------------------------

// app.use("/api/analytics",  require("./routes/analyticsRoutes"));
app.use("/api/geoip", require("./routes/geoip"));
app.use("/api/track", require("./routes/track"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/superadmin", require("./routes/superAdmin"));
app.use("/api/cms-content", require("./routes/cmsRoutes"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/product"));
app.use("/api/usersadmin", require("./routes/adminUserRoutes"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/checkout", require("./routes/checkout"));
app.use("/api/user/address", require("./routes/addressRoutes"));
app.use("/api/user", require("./routes/profile"));
app.use("/api/cart", require("./routes/cart"));
app.use("/api/otp-password", require("./routes/otpPassword"));
app.use("/api/email-otp-password", require("./routes/emailOtpPassword"));
app.use("/api/search", require("./routes/search"));




app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "KZARRÈ E-Commerce Backend API",
  });
});

// ----------------------------
// ERROR HANDLER
// ----------------------------
app.use(errorHandler);

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 5500;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log("🚀 Ready...\n");
});
