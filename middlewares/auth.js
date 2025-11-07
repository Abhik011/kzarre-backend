const jwt = require("jsonwebtoken");
const User = require("../models/Customer");

// ================================================
// ✅ AUTH MIDDLEWARE
// ================================================
const auth = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = header.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select("-password");
      if (!user) return res.status(401).json({ message: "User not found" });

      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      req.user = user;
      next();
    } catch (err) {
      console.error("JWT Auth Error:", err.message);
      res.status(401).json({ message: "Invalid token" });
    }
  };
};

// ================================================
// ✅ LOGIN CONTROLLER (Tracks IP)
// ================================================
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // ✅ Get user IP safely
    const userIP =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    // ✅ Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ Save IP + timestamp
    user.lastLoginIP = userIP;
    user.lastLoginAt = new Date();
    await user.save();

    // ✅ Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // ✅ Respond
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      ip: userIP,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        lastLoginIP: user.lastLoginIP,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ================================================
// ✅ EXPORT BOTH
// ================================================
module.exports = {
  auth,
  loginUser,
};
