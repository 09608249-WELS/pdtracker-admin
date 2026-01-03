// routes/certificates.js
const express = require("express");
const puppeteer = require("puppeteer");
const { getPool, sql } = require("../db");

const router = express.Router();
const fs = require("fs");
const path = require("path");

function loadLogoDataUri() {
  const p = path.join(process.cwd(), "public", "assets", "wels-logo.png");

  if (!fs.existsSync(p)) {
    return null;
  }

  const ext = path.extname(p).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    "image/png";

  const b64 = fs.readFileSync(p).toString("base64");

  return `data:${mime};base64,${b64}`;
}


function toDMY(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function groupByStaff(rows) {
  const map = new Map();
  for (const r of rows) {
    const staffKey = r.StaffID ?? `name:${r.StaffNameSnapshot ?? "Unknown"}`;
    const staffName =
      r.StaffNameCurrent || r.StaffNameSnapshot || "Unknown Staff";

    if (!map.has(staffKey)) {
      map.set(staffKey, { staffName, items: [] });
    }
    map.get(staffKey).items.push(r);
  }

  // Ensure each staff’s items are sorted
  for (const g of map.values()) {
    g.items.sort((a, b) => {
      const ad = a.StartDate ? new Date(a.StartDate).getTime() : 0;
      const bd = b.StartDate ? new Date(b.StartDate).getTime() : 0;
      if (ad !== bd) return ad - bd;
      return (a.PDRecordID ?? 0) - (b.PDRecordID ?? 0);
    });
  }

  // Sort staff pages A–Z
  return [...map.values()].sort((a, b) =>
    a.staffName.localeCompare(b.staffName, "en", { sensitivity: "base" })
  );
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function renderCertificatesHtml(groups, opts = {}) {
  const title = opts.title || "Professional Development Record";
  const logoDataUri = opts.logoDataUri || null;

  const ROWS_PER_PAGE = 18; // adjust if you want more/less per page

  const pages = [];

  for (const g of groups) {
    const chunks = chunk(g.items || [], ROWS_PER_PAGE);

    // If no items, still produce one page
    const safeChunks = chunks.length ? chunks : [[]];

    safeChunks.forEach((itemsChunk, chunkIndex) => {
      const isLastPageForStaff = chunkIndex === safeChunks.length - 1;

      const rowsHtml = itemsChunk
        .map((r) => {
          return `
            <tr>
              <td class="col-date">${escapeHtml(toDMY(r.StartDate))}</td>
              <td class="col-area">${escapeHtml(r.AreaName || "")}</td>
              <td class="col-venue">${escapeHtml(r.VenueDisplay || "")}</td>
              <td class="col-title">${escapeHtml(r.Title || "")}</td>
              <td class="col-hours">${escapeHtml(r.Hours ?? "")}</td>
            </tr>
          `;
        })
        .join("");

      pages.push(`
        <section class="page">
          <div class="border">
            <div class="header">
              ${
                logoDataUri
                  ? `<img class="logo" src="${logoDataUri}" alt="School logo">`
                  : `<div class="school-fallback">Western English Language School</div>`
              }
              <div class="doctitle">${escapeHtml(title)}</div>
            </div>

            <div class="certify">This is to certify that</div>
            <div class="name">${escapeHtml(g.staffName)}</div>
            <div class="certify2">has attended the following Professional Development activities</div>

            <div class="content">
              <table class="pdtable">
                <thead>
                  <tr>
                    <th class="col-date">Date</th>
                    <th class="col-area">Area</th>
                    <th class="col-venue">Venue</th>
                    <th class="col-title">Activity</th>
                    <th class="col-hours">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    rowsHtml ||
                    `<tr><td colspan="5" class="none">No PD records found for this staff member.</td></tr>`
                  }
                </tbody>
              </table>

              ${
                // Optional: if there are more pages for this staff, show a small continuation hint
                !isLastPageForStaff
                  ? `<div class="continued">(continued)</div>`
                  : ``
              }
            </div>

            ${
              // ✅ Signature block ONLY on the last page for the staff member
              isLastPageForStaff
                ? `
                  <div class="sigrow">
                    <div class="sig">
                      <div class="line"></div>
                      <div class="label">Professional Development Coordinator</div>
                    </div>
                    <div class="sig">
                      <div class="line"></div>
                      <div class="label">Principal</div>
                    </div>
                  </div>
                `
                : ``
            }

            <div class="footer">
              Generated ${escapeHtml(toDMY(new Date()))}
            </div>
          </div>
        </section>
      `);
    });
  }

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 16mm; }
      body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; }

      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }

      /* Make border act like a full-page container so we can push signatures to bottom */
      .border {
        border: 2px solid #111;
        padding: 14mm 12mm;
        box-sizing: border-box;
        min-height: 250mm;
        display: flex;
        flex-direction: column;
      }

      .header { text-align: center; margin-bottom: 8mm; }
      .logo { max-height: 34mm; max-width: 160mm; object-fit: contain; }
      .school-fallback { font-weight: 700; font-size: 18pt; }
      .doctitle { margin-top: 3mm; font-size: 12pt; }

      .certify, .certify2 { text-align: center; margin: 4mm 0; }
      .name { text-align: center; font-weight: 800; font-size: 16pt; margin: 3mm 0 6mm; }

      /* Content grows; signature sits at the bottom of the last page */
      .content { flex: 1; margin-top: 4mm; }

      /* ✅ No border lines in table */
      .pdtable {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 10pt;
      }
      .pdtable th, .pdtable td {
        border: none;
        padding: 6px 6px;
        vertical-align: top;
        text-align: center; /* ✅ center text in all columns */
      }
      .pdtable th { font-weight: 700; padding-bottom: 8px; }

      /* column widths */
      .col-date  { width: 16%; }
      .col-area  { width: 16%; }
      .col-venue { width: 18%; }
      .col-title { width: 40%; }
      .col-hours { width: 10%; }

      .none { text-align: center; padding: 10mm 0; }
      .continued { text-align: center; margin-top: 6mm; font-size: 9pt; color: #555; }

      .sigrow {
        display: flex;
        justify-content: space-between;
        gap: 12mm;
        margin-top: auto; /* ✅ pushes to bottom of last page */
        padding-top: 10mm;
      }
      .sig { flex: 1; text-align: center; }
      .line { border-bottom: 1px solid #111; height: 18px; margin: 0 auto 4px; width: 80%; }
      .label { font-size: 10pt; }

      .footer {
        margin-top: 6mm;
        font-size: 9pt;
        color: #555;
        text-align: right;
      }
    </style>
  </head>
  <body>
    ${pages.join("\n")}
  </body>
  </html>
  `;
}


router.get("/pdrecords/certificates.pdf", async (req, res) => {
  // Reuse the SAME filters your /api/pdrecords supports:
  // req.query.startDate, endDate, staffId, areaId, venueId, accrual, q, etc.

  const pool = await getPool();

  // Build WHERE dynamically but parameterized
  const where = ["r.IsDeleted = 0"];
  const request = pool.request();

  // Example filters — match your existing API’s query params:
  if (req.query.staffId) {
    where.push("r.StaffID = @StaffID");
    request.input("StaffID", sql.Int, Number(req.query.staffId));
  }
  if (req.query.dateFrom) {
    where.push("r.StartDate >= @DateFrom");
    request.input("DateFrom", sql.Date, req.query.dateFrom);
  }
  if (req.query.dateTo) {
    where.push("r.StartDate <= @DateTo");
    request.input("DateTo", sql.Date, req.query.dateTo);
  }
  if (req.query.areaId) {
    where.push("r.AreaID = @AreaID");
    request.input("AreaID", sql.Int, Number(req.query.areaId));
  }
  if (req.query.venueId) {
    where.push("r.VenueID = @VenueID");
    request.input("VenueID", sql.Int, Number(req.query.venueId));
  }
  if (req.query.accrual === "1" || req.query.accrual === "true") {
    where.push("r.IsAccrual = 1");
  }
  if (req.query.q) {
    // title search
    where.push("r.Title LIKE @Q");
    request.input("Q", sql.NVarChar(200), `%${req.query.q}%`);
  }

  const sqlText = `
    SELECT
      r.PDRecordID,
      r.StaffID,
      StaffNameCurrent = s.Name,
      r.StaffNameSnapshot,
      r.StartDate,
      r.EndDate,
      a.AreaName,
      VenueDisplay = COALESCE(v.VenueName, r.VenueOther),
      r.Title,
      r.Hours,
      r.Total,
      r.IsAccrual
    FROM dbo.PDRecord r
    LEFT JOIN dbo.Staff s ON s.StaffID = r.StaffID
    LEFT JOIN dbo.Area  a ON a.AreaID  = r.AreaID
    LEFT JOIN dbo.Venue v ON v.VenueID = r.VenueID
    WHERE ${where.join("\n      AND ")}
    ORDER BY
      COALESCE(s.Name, r.StaffNameSnapshot),
      r.StartDate,
      r.PDRecordID;
  `;

  const result = await request.query(sqlText);
  const rows = result.recordset || [];

  const groups = groupByStaff(rows);

  if (!groups.length) {
    res.status(404).json({ error: "No records found for the selected filters." });
    return;
  }

const logoDataUri = loadLogoDataUri(); // ✅ actually load it

const html = renderCertificatesHtml(groups, {
  logoDataUri, // ✅ pass into template
  title: "Certificate of Professional Development",
});


  const browser = await puppeteer.launch({
    // Windows-safe defaults; add args if your environment needs them
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="pd-certificates-${today}.pdf"`
    );
    res.send(pdfBuffer);
  } finally {
    await browser.close();
  }
});

module.exports = router;
