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

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // ✅ replace with your frontend domain later
    credentials: true,
  },
});

global.io = io;

io.on("connection", (socket) => {
  console.log("Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" })
);

app.use("/api/stripe", require("./routes/stripeWebhook"));

// ----------------------------
// SECURITY + BASE MIDDLEWARE
// ----------------------------
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
// ============================
// 🔍 AUTH + COOKIE DEBUG (DEV ONLY)
// ============================
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("\n🔍 AUTH DEBUG");
    console.log("➡️ URL:", req.method, req.originalUrl);
    console.log("🍪 Cookies:", req.cookies || "NONE");
    console.log("🪪 Authorization:", req.headers.authorization || "NONE");
    console.log("🌐 Origin:", req.headers.origin || "NONE");
    console.log("📡 IP:", req.ip);
    console.log("✅ END AUTH DEBUG\n");
  }
  next();
});
   // <-- FIXED (must be early)
app.use(morgan("dev"));
app.use("/uploads", express.static("uploads"));

// ----------------------------
// TRUST PROXY (NEEDED FOR IP)
// ----------------------------
app.set("trust proxy", 1);
 // <-- keep this


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
   "https://kzarre-admin.vercel.app",
   "https://0jvrs0g4-3000.inc1.devtunnels.ms/",
   "http://13.60.212.51:5500/",
   "http://13.60.212.51:3000/",
   "http://13.60.212.51:3001/",
   "http://13.60.212.51/",
   "http://kzarre-aws.duckdns.org/",
   "ss"
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
    keyGenerator: rateLimit.ipKeyGenerator,
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
app.use("/api/notify", require("./routes/notifyRoutes"))
app.use("/api/admin/shipping", require("./routes/adminShipping"));
app.use("/api/admin/returns", require("./routes/adminReturns"));
app.use("/api/admin/audit", require("./routes/adminAudit"));
app.use("/api/admin/campaign", require("./routes/adminCampaign"));
app.use("/api/admin/seo", require("./routes/adminSEO"));
app.use("/api/admin/ads", require("./routes/adminAds"));
app.use("/api/crm", require("./routes/adminCRM"));
app.use("/cms", require("./routes/cmsFont"));

// cheching piplines


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
server.listen(PORT, HOST, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log("🔔 Socket.IO enabled");
  console.log("🚀 Ready...\n");
});

