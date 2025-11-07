// ========================================================
// 💎 KZARRÈ — Luxury Email Templates Suite
// ========================================================
// Author: Abhijeet (KZARRÈ Project)
// Description: Unified set of HTML templates for OTP, Welcome,
// Verified, and Order Confirmation emails.
// ========================================================

const brand = {
  name: "KZARRÈ",
  url: "https://kzarre.com",
  colorGold: "#d9c169",
  colorDark: "#0C2B19",
  colorDeep: "#082415",
};

// Base wrapper generator
const baseLayout = (title, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${brand.name} — ${title}</title>
<style>
  body {
    background-color: ${brand.colorDark};
    color: #fff;
    font-family: 'Poppins', sans-serif;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    background: ${brand.colorDeep};
    margin: 40px auto;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    overflow: hidden;
  }
  .header {
    background: linear-gradient(135deg, ${brand.colorGold}, #bca45d);
    color: ${brand.colorDeep};
    text-align: center;
    padding: 35px 15px;
  }
  .header h1 {
    font-size: 32px;
    letter-spacing: 4px;
    margin: 0;
    font-weight: 900;
  }
  .content {
    padding: 40px 25px;
    text-align: center;
  }
  .content h2 {
    color: ${brand.colorGold};
    font-size: 24px;
    margin-bottom: 10px;
  }
  .content p {
    color: #ddd;
    font-size: 16px;
    line-height: 1.7;
    margin-bottom: 20px;
  }
  .otp-box {
    background-color: #111;
    border: 2px solid ${brand.colorGold};
    display: inline-block;
    padding: 14px 30px;
    font-size: 26px;
    font-weight: bold;
    border-radius: 10px;
    letter-spacing: 6px;
    margin: 20px 0;
    color: #fff;
  }
  .btn {
    background: ${brand.colorGold};
    color: ${brand.colorDeep};
    padding: 12px 24px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    letter-spacing: 1px;
    transition: all 0.3s ease;
    display: inline-block;
  }
  .btn:hover {
    background: #bca45d;
  }
  .divider {
    margin: 25px auto;
    width: 70%;
    height: 1px;
    background: rgba(255,255,255,0.1);
  }
  .footer {
    text-align: center;
    padding: 20px;
    font-size: 12px;
    color: #888;
    background: #0f3923;
  }
  .footer a {
    color: ${brand.colorGold};
    text-decoration: none;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${brand.name}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} <a href="${brand.url}">${brand.name}</a>. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

// ========================================================
// 🔐 1. OTP VERIFICATION TEMPLATE
// ========================================================
exports.otpEmailTemplate = (name, otp) =>
  baseLayout(
    "OTP Verification",
    `
    <h2>Hello ${name || "there"},</h2>
    <p>Welcome to <strong>${brand.name}</strong> — where luxury meets design.</p>
    <p>Use this verification code to confirm your email:</p>
    <div class="otp-box">${otp}</div>
    <p>This code expires in <strong>5 minutes</strong>.</p>
    <p>If this wasn’t you, please ignore this message.</p>
  `
  );

// ========================================================
// 🎉 2. WELCOME EMAIL TEMPLATE
// ========================================================
exports.welcomeEmailTemplate = (name) =>
  baseLayout(
    "Welcome to KZARRÈ",
    `
    <h2>Welcome aboard, ${name || "Valued Guest"}!</h2>
    <p>We’re thrilled to have you join <strong>${brand.name}</strong> — where craftsmanship meets contemporary design.</p>
    <p>Explore our curated collections of fashion, lifestyle, and design crafted for those who appreciate timeless elegance.</p>
    <a href="${brand.url}" class="btn">Start Exploring</a>
    <div class="divider"></div>
    <p style="color:#aaa; font-size:14px;">Thank you for trusting us. We can’t wait to elevate your experience.</p>
  `
  );

// ========================================================
// ✅ 3. YOU’RE VERIFIED EMAIL TEMPLATE
// ========================================================
exports.verifiedEmailTemplate = (name) =>
  baseLayout(
    "Email Verified",
    `
    <h2>Congratulations, ${name || "KZARRÈ Member"}!</h2>
    <p>Your email has been successfully verified. You’re now part of the <strong>${brand.name}</strong> family.</p>
    <p>Enjoy early access to collections, exclusive rewards, and a truly personalized experience.</p>
    <a href="${brand.url}" class="btn">Visit KZARRÈ</a>
    <div class="divider"></div>
    <p>We’re honored to have you with us.</p>
  `
  );

// ========================================================
// 🛍️ 4. ORDER CONFIRMATION EMAIL TEMPLATE
// ========================================================
exports.orderConfirmationTemplate = (name, orderId, items = [], total) => {
  const itemList = items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 10px; text-align:left;">${i.name}</td>
        <td style="padding:8px 10px; text-align:center;">${i.qty}</td>
        <td style="padding:8px 10px; text-align:right;">₹${i.price}</td>
      </tr>`
    )
    .join("");

  return baseLayout(
    "Order Confirmation",
    `
    <h2>Thank you for your order, ${name || "Customer"}!</h2>
    <p>Your order <strong>#${orderId}</strong> has been confirmed.</p>
    <p>Here’s a summary of your purchase:</p>
    <table style="width:100%; color:#ddd; font-size:14px; border-collapse:collapse; margin-top:15px;">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
          <th style="text-align:left;">Item</th>
          <th>Qty</th>
          <th style="text-align:right;">Price</th>
        </tr>
      </thead>
      <tbody>${itemList}</tbody>
    </table>
    <div class="divider"></div>
    <h3 style="color:${brand.colorGold}; text-align:right;">Total: ₹${total}</h3>
    <p>Your order is being prepared with care and will be shipped soon.</p>
    <a href="${brand.url}/orders/${orderId}" class="btn">Track Order</a>
    <div class="divider"></div>
    <p>Thank you for shopping with <strong>${brand.name}</strong>.</p>
  `
  );
};
