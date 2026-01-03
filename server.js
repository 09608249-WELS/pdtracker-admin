// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { getPool } = require("./db");

// ✅ Mount routers
const pdrecordsRouter = require("./routes/pdrecords");
const venuesRouter = require("./routes/venues");
const certificates = require("./routes/certificates");
console.log("ENV SQL_SERVER =", process.env.SQL_SERVER);

const app = express();

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ GET /api/pdrecords (list + paging) + PATCH/DELETE /api/pdrecords/:id
app.use("/api/pdrecords", pdrecordsRouter);
app.use("/api/venues", venuesRouter);
app.use("/api", certificates);
// Health check (real DB call)
app.get("/api/health", async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query("SELECT DB_NAME() AS dbname;");
    res.json({ ok: true, ...r.recordset[0] });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

// Staff list
app.get("/api/staff", async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().execute("dbo.uspStaff_List");
    res.json({ ok: true, staff: r.recordset });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

// Lookups (Areas, Sectors, Sites) - multiple resultsets
app.get("/api/lookups", async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().execute("dbo.uspLookups_GetAll");

    const [areas, sectors, sites] = r.recordsets;

    res.json({
      ok: true,
      areas: areas || [],
      sectors: sectors || [],
      sites: sites || [],
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

// ✅ Keep your existing bulk insert endpoint for Entry mode
app.post("/api/pdrecords", async (req, res) => {
  try {
    const {
      meetingId = null,
      startDate,
      endDate = null,
      areaId,
      title,
      venueId = null,
      venueOther = null,
      hours,
      crt = 0,
      enrol = 0,
      other = 0,
      isAccrual = false,
      staffIds,
    } = req.body || {};

    // Basic API validation
    if (!startDate) return res.status(400).json({ ok: false, error: "startDate is required" });
    if (!areaId) return res.status(400).json({ ok: false, error: "areaId is required" });
    if (!title || !String(title).trim()) return res.status(400).json({ ok: false, error: "title is required" });
    if (!Array.isArray(staffIds) || staffIds.length === 0)
      return res.status(400).json({ ok: false, error: "staffIds must be a non-empty array" });

    const pool = await getPool();
    const sql = require("mssql");

    // Build TVP for Staff IDs
    const tvp = new sql.Table("dbo.StaffIdList");
    tvp.columns.add("StaffID", sql.Int, { nullable: false });

    // de-dupe + ensure ints
    const uniqueIds = [...new Set(staffIds.map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n)))];
    if (uniqueIds.length === 0)
      return res.status(400).json({ ok: false, error: "staffIds must contain valid integers" });

    uniqueIds.forEach((id) => tvp.rows.add(id));

    const r = await pool
      .request()
      .input("MeetingId", sql.NVarChar(100), meetingId)
      .input("StartDate", sql.Date, startDate)
      .input("EndDate", sql.Date, endDate)
      .input("AreaID", sql.Int, parseInt(areaId, 10))
      .input("Title", sql.NVarChar(200), String(title).trim())
      .input("VenueID", sql.Int, venueId === null || venueId === "" ? null : parseInt(venueId, 10))
      .input("VenueOther", sql.NVarChar(200), venueOther === null || venueOther === "" ? null : String(venueOther))
      .input("Hours", sql.Decimal(6, 2), Number(hours))
      .input("CRT", sql.Decimal(10, 2), Number(crt))
      .input("Enrol", sql.Decimal(10, 2), Number(enrol))
      .input("Other", sql.Decimal(10, 2), Number(other))
      .input("IsAccrual", sql.Bit, isAccrual ? 1 : 0)
      .input("Staff", tvp)
      .execute("dbo.uspPDRecord_InsertBulk");

    const insertedRows = r.recordset?.[0]?.InsertedRows ?? 0;

    res.json({ ok: true, insertedRows });
  } catch (err) {
    console.error("POST /api/pdrecords error:", err);
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
