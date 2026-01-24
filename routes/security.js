const express = require("express");
const router = express.Router();

const accessAuth = require("../middlewares/accessAuth");
const DataRequest = require("../models/DataRequest");

const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

/* ======================================================
   AUDIT SETTINGS (TEMP – IN MEMORY)
====================================================== */

let auditSettings = {
  wormLogs: true,
  quarterlyAccessReview: true,
};

/* ================= AUDIT SETTINGS ================= */

router.get("/audit-settings", accessAuth, (req, res) => {
  res.json({
    wormLogs: auditSettings.wormLogs,
    quarterlyAccessReview: auditSettings.quarterlyAccessReview,
  });
});

router.post("/audit-settings", accessAuth, (req, res) => {
  auditSettings = {
    wormLogs: !!req.body.wormLogs,
    quarterlyAccessReview: !!req.body.quarterlyAccessReview,
  };

  res.json({
    success: true,
    message: "Audit settings saved successfully",
    settings: auditSettings,
  });
});

/* ================= GET DATA REQUESTS ================= */

router.get("/data-requests", accessAuth, async (req, res) => {
  try {
    const requests = await DataRequest.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ requests });
  } catch (err) {
    console.error("Load requests failed", err);
    res.status(500).json({ message: "Failed to load requests" });
  }
});

/* ================= CREATE DATA REQUEST ================= */

router.post("/data-request", accessAuth, async (req, res) => {
  try {
    const { customerEmail, requestType } = req.body;

    if (!customerEmail || !requestType) {
      return res.status(400).json({
        message: "Customer email and request type required",
      });
    }

    const record = await DataRequest.create({
      customerEmail,
      requestType,
      requestedBy: req.user.email,
      status: "pending",
    });

    res.json({
      success: true,
      request: record,
    });
  } catch (err) {
    console.error("Create request failed", err);
    res.status(500).json({ message: "Failed to submit request" });
  }
});

/* ======================================================
   HELPER: BLOCK RE-EXPORT
====================================================== */

function blockIfCompleted(request, res) {
  if (request.status === "completed") {
    res.status(403).json({
      message: "This request is already completed and cannot be re-exported",
    });
    return true;
  }
  return false;
}

/* ================= EXPORT CSV ================= */

router.get("/export-csv/:id", accessAuth, async (req, res) => {
  try {
    const request = await DataRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // 🔐 disable re-export
    if (blockIfCompleted(request, res)) return;

    // ⬇️ Replace with real customer data source later
    const customerData = [
      {
        email: request.customerEmail,
        requestType: request.requestType,
        requestedBy: request.requestedBy,
        exportedAt: new Date().toISOString(),
      },
    ];

    const parser = new Parser();
    const csv = parser.parse(customerData);

    // 🧾 AUDIT + STATUS UPDATE
    request.status = "completed";
    request.exportedAt = new Date();
    request.exportLogs = request.exportLogs || [];
    request.exportLogs.push({
      exportedBy: req.user.email,
      exportedAt: new Date(),
      format: "csv",
      ipAddress: req.ip,
    });

    await request.save();

    res.header("Content-Type", "text/csv");
    res.attachment(`customer-data-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    console.error("CSV export failed", err);
    res.status(500).json({ message: "CSV export failed" });
  }
});

// ================= DIRECT EXPORT CSV =================
router.get("/export-csv", accessAuth, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email parameter required" });
    }

    // Create audit log entry for direct export
    const auditLog = {
      customerEmail: email,
      requestType: "direct_export_csv",
      requestedBy: req.user.email,
      status: "completed",
      exportedAt: new Date(),
      exportLogs: [{
        exportedBy: req.user.email,
        exportedAt: new Date(),
        format: "csv",
        ipAddress: req.ip,
      }],
    };

    // Save to database for audit trail
    await DataRequest.create(auditLog);

    // ⬇️ Replace with real customer data source later
    const customerData = [
      {
        email: email,
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.email,
      },
    ];

    const parser = new Parser();
    const csv = parser.parse(customerData);

    res.header("Content-Type", "text/csv");
    res.attachment(`customer-data-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    console.error("Direct CSV export failed", err);
    res.status(500).json({ message: "CSV export failed" });
  }
});

/* ================= EXPORT PDF ================= */

router.get("/export-pdf/:id", accessAuth, async (req, res) => {
  try {
    const request = await DataRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // 🔐 disable re-export
    if (blockIfCompleted(request, res)) return;

    // 🧾 AUDIT + STATUS UPDATE
    request.status = "completed";
    request.exportedAt = new Date();
    request.exportLogs = request.exportLogs || [];
    request.exportLogs.push({
      exportedBy: req.user.email,
      exportedAt: new Date(),
      format: "pdf",
      ipAddress: req.ip,
    });

    await request.save();

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=customer-data-${Date.now()}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(18).text("Customer Data Export", { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Customer Email: ${request.customerEmail}`);
    doc.text(`Request Type: ${request.requestType}`);
    doc.text(`Status: completed`);
    doc.text(`Exported By: ${req.user.email}`);
    doc.text(`Exported At: ${new Date().toLocaleString()}`);

    doc.end();
  } catch (err) {
    console.error("PDF export failed", err);
    res.status(500).json({ message: "PDF export failed" });
  }
});

// ================= DIRECT EXPORT PDF =================
router.get("/export-pdf", accessAuth, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email parameter required" });
    }

    // Create audit log entry for direct export
    const auditLog = {
      customerEmail: email,
      requestType: "direct_export_pdf",
      requestedBy: req.user.email,
      status: "completed",
      exportedAt: new Date(),
      exportLogs: [{
        exportedBy: req.user.email,
        exportedAt: new Date(),
        format: "pdf",
        ipAddress: req.ip,
      }],
    };

    // Save to database for audit trail
    await DataRequest.create(auditLog);

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=customer-data-${Date.now()}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(18).text("Customer Data Export", { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Customer Email: ${email}`);
    doc.text(`Request Type: Direct Export`);
    doc.text(`Status: completed`);
    doc.text(`Exported By: ${req.user.email}`);
    doc.text(`Exported At: ${new Date().toLocaleString()}`);

    doc.end();
  } catch (err) {
    console.error("Direct PDF export failed", err);
    res.status(500).json({ message: "PDF export failed" });
  }
});

module.exports = router;
