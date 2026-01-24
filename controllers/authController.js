const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Customer = require('../models/Customer');
const { registerSchema, loginSchema } = require('../utils/validators');
const { sendEmail } = require('../utils/sendEmail');
const {
  otpEmailTemplate,
  welcomeEmailTemplate,
  verifiedEmailTemplate,
  passwordResetTemplate,
  orderConfirmationTemplate
} = require('../utils/emailTemplates');

// Helper: generate JWT
const generateToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

// Helper: generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// ===== REGISTER =====
exports.register = async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const existing = await Customer.findOne({ email: value.email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    // Create new customer
    const customer = new Customer(value);

    // Generate OTP
    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    customer.otp = hashedOtp;
    customer.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes

    await customer.save();

    // Send OTP email
    await sendEmail(
      customer.email,
      'Verify your KZARRÈ Account',
      otpEmailTemplate(customer.name, otp)
    );

    res.status(201).json({
      message: 'Customer registered successfully. Please verify your email.',
      userId: customer._id,
    });
  } catch (err) {
    next(err);
  }
};

// ===== VERIFY OTP =====
exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const customer = await Customer.findOne({ email });
    if (!customer) return res.status(400).json({ message: 'User not found' });

    if (!customer.otp || !customer.otpExpires)
      return res.status(400).json({ message: 'OTP not generated' });

    if (customer.otpExpires < Date.now())
      return res.status(400).json({ message: 'OTP expired. Please request again.' });

    const isMatch = await bcrypt.compare(otp, customer.otp);
    if (!isMatch) return res.status(400).json({ message: 'Invalid OTP' });

    customer.isVerified = true;
    customer.otp = undefined;
    customer.otpExpires = undefined;
    await customer.save();

    // Send “You’re Verified” and Welcome emails
    await sendEmail(
      customer.email,
      'Your KZARRÈ Account is Verified!',
      verifiedEmailTemplate(customer.name)
    );

    await sendEmail(
      customer.email,
      'Welcome to KZARRÈ — Experience Luxury Redefined',
      welcomeEmailTemplate(customer.name)
    );

    const token = generateToken(customer);

    res.json({
      message: 'Email verified successfully!',
      user: { id: customer._id, name: customer.name, email: customer.email },
      token,
    });
  } catch (err) {
    next(err);
  }
};

// ===== LOGIN =====
// ===== LOGIN (WITH COOKIE) =====
exports.login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const user = await Customer.findOne({ email: value.email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const match = await user.comparePassword(value.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 🔥 EMAIL NOT VERIFIED → FORCE OTP
    if (!user.isVerified) {
      // Generate NEW OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await bcrypt.hash(otp, 10);

      user.otp = hashedOtp;
      user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 min
      await user.save();

      // Send OTP again
      await sendEmail(
        user.email,
        "Verify your KZARRÈ account",
        otpEmailTemplate(user.name, otp)
      );

      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before logging in",
        email: user.email,
      });
    }

    // ✅ VERIFIED → LOGIN
    const token = generateToken(user);

    res.cookie("kzarre_token", token, {
      httpOnly: true,
      secure: false, // true in prod
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    next(err);
  }
};




// ===== FORGOT PASSWORD =====
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const customer = await Customer.findOne({ email });
    if (!customer) return res.status(404).json({ message: 'User not found' });

    // Generate reset token
    const resetToken = jwt.sign({ id: customer._id }, process.env.JWT_SECRET, {
      expiresIn: '15m',
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await sendEmail(
      customer.email,
      'Reset Your KZARRÈ Password',
      passwordResetTemplate(customer.name, resetLink)
    );

    res.json({ message: 'Password reset email sent successfully.' });
  } catch (err) {
    next(err);
  }
};
