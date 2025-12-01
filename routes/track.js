const express = require("express");
const router = express.Router();
const Traffic = require("../models/Traffic");
let geoip = null;
let UAParser = null;

try { geoip = require("geoip-lite"); } catch {}
try { UAParser = require("ua-parser-js"); } catch {}

// ✅ Normalize IPv4 + IPv6
function getClientIP(req, publicIP) {
  let ip =
    publicIP ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "";

  // ✅ Remove IPv6 prefix if present (::ffff:127.0.0.1)
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  // ✅ Convert IPv6 localhost to IPv4
  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
}

router.post("/", async (req, res) => {
  try {
    const { visitorId, userId, url, userAgent, publicIP } = req.body;

    if (!visitorId) {
      return res.status(400).json({
        success: false,
        message: "visitorId required",
      });
    }

    // ✅ FULL IPv4 + IPv6 SAFE IP DETECTION
    const ip = getClientIP(req, publicIP);

    const doc = {
      visitorId,
      userId,
      url,
      ip,
      userAgent: userAgent || req.headers["user-agent"] || "Unknown",
    };

    // ✅ First-time visitor check
    const exists = await Traffic.findOne({ visitorId });
    doc.isFirstTime = !exists;

    // ✅ GEO LOOKUP (IPv4 + IPv6)
    if (geoip && ip) {
      const geo = geoip.lookup(ip);
      if (geo) {
        doc.country = geo.country || "UN";   // ISO Code (IN, US, etc.)
        doc.region = geo.region || "Unknown";
        doc.city = geo.city || "Unknown";
      } else {
        doc.country = "UN";
        doc.region = "Unknown";
        doc.city = "Unknown";
      }
    }

    // ✅ USER-AGENT PARSING
    if (UAParser) {
      const parser = new UAParser(doc.userAgent);
      const device = parser.getDevice();
      const os = parser.getOS();
      const browser = parser.getBrowser();

      doc.deviceType = device.type || "desktop";
      doc.os = os.name || null;
      doc.browser = browser.name || null;
    }

    await Traffic.create(doc);

    res.json({ success: true });
  } catch (err) {
    console.error("🔥 Error saving traffic:", err);
    res.status(500).json({
      success: false,
      message: "Tracking failed",
    });
  }
});

module.exports = router;
