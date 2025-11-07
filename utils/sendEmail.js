const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter configuration (helps debug Gmail connection)
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter setup failed:", error.message);
  } else {
    console.log("✅ Email transporter ready to send messages");
  }
});

exports.sendEmail = async (to, subject, html) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("❌ Missing EMAIL_USER or EMAIL_PASS in .env");
      return;
    }

    const mailOptions = {
      from: `"KZARRÈ" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent successfully to ${to} | Message ID: ${info.messageId}`);
  } catch (error) {
    console.error("❌ Email send failed:", error.message);
  }
};
