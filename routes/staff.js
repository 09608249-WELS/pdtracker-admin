// routes/staff.js
const express = require("express");
const router = express.Router();
const { sql, getPool } = require("../db");

// Helpers
function asBit(v) {
  if (v === true || v === 1 || v === "1" || v === "true" || v === "on" || v === "yes") return 1;
  return 0;
}

function csvOrNull(q) {
  if (q == null) return null;
  const s = String(q).trim();
  return s ? s : null;
}

function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function intOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/**
 * GET /api/staff
 * Query params (all optional):
 *   includeArchived=0|1
 *   search=...
 *   campus=csv
 *   position=csv
 *   sector=csv
 */
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();

    // ---- query params -> proc params ----
    const includeArchived =
      req.query.includeArchived === "1" ||
      req.query.includeArchived === "true" ||
      req.query.includeArchived === "on" ||
      req.query.includeArchived === "yes";

    const search = (req.query.search ?? "").toString().trim() || null;

    const campusCsv = (req.query.campus ?? req.query.campuses ?? "").toString().trim() || null;
    const positionCsv = (req.query.position ?? req.query.positions ?? "").toString().trim() || null;
    const sectorCsv = (req.query.sector ?? req.query.sectors ?? "").toString().trim() || null;

    const r = await pool
      .request()
      .input("IncludeArchived", sql.Bit, includeArchived)
      .input("Search", sql.NVarChar(200), search)
      .input("CampusCsv", sql.NVarChar(sql.MAX), campusCsv)
      .input("PositionCsv", sql.NVarChar(sql.MAX), positionCsv)
      .input("SectorCsv", sql.NVarChar(sql.MAX), sectorCsv)
      .execute("dbo.Staff_List");

    const rows = r.recordset || [];

    res.json({
      ok: true,
      staff: rows,
      rows,
      success: true,
    });
  } catch (err) {
    console.error("GET /api/staff failed:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch staff." });
  }
});



/**
 * POST /api/staff
 * Body:
 *   { name, campus1, campus2, position, sector, tonumber }
 */
router.post("/", async (req, res) => {
  try {
    const pool = await getPool();

    const name = strOrNull(req.body?.name);
    if (!name) return res.status(400).json({ error: "Name is required." });

    const campus1 = strOrNull(req.body?.campus1);
    const campus2 = strOrNull(req.body?.campus2);
    const position = strOrNull(req.body?.position);
    const sector = strOrNull(req.body?.sector);
    const tonumber = intOrNull(req.body?.tonumber ?? req.body?.TONumber);

    // You can replace this with req.user.email later
    const actor = req.get("x-actor") || "webapp";

    const r = await pool
      .request()
      .input("Name", sql.NVarChar(200), name)
      .input("Campus1", sql.NVarChar(100), campus1)
      .input("Campus2", sql.NVarChar(100), campus2)
      .input("Position", sql.NVarChar(100), position)
      .input("Sector", sql.NVarChar(50), sector)
      .input("TONumber", sql.Int, tonumber)
      .input("Actor", sql.NVarChar(128), actor)
      .execute("dbo.Staff_Create");

    const staffId =
      r.recordset?.[0]?.StaffID ??
      r.output?.StaffID ??
      null;

    res.status(201).json({
      success: true,
      staffId,
    });
  } catch (err) {
    console.error("POST /api/staff failed:", err);

    // Friendly messages for your THROW codes (if present)
    const msg = String(err?.message || "");
    if (msg.includes("already exists")) {
      return res.status(409).json({ error: msg });
    }
    if (msg.includes("Name is required")) {
      return res.status(400).json({ error: msg });
    }

    res.status(500).json({ error: "Failed to create staff member." });
  }
});

/**
 * PUT /api/staff/:id
 * Body:
 *   { name, campus1, campus2, position, sector, tonumber }
 */
router.put("/:id", async (req, res) => {
  try {
    const pool = await getPool();

    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId <= 0) {
      return res.status(400).json({ error: "Invalid StaffID." });
    }

    const name = strOrNull(req.body?.name);
    if (!name) return res.status(400).json({ error: "Name is required." });

    const campus1 = strOrNull(req.body?.campus1);
    const campus2 = strOrNull(req.body?.campus2);
    const position = strOrNull(req.body?.position);
    const sector = strOrNull(req.body?.sector);
    const tonumber = intOrNull(req.body?.tonumber ?? req.body?.TONumber);

    const actor = req.get("x-actor") || "webapp";

    await pool
      .request()
      .input("StaffID", sql.Int, staffId)
      .input("Name", sql.NVarChar(200), name)
      .input("Campus1", sql.NVarChar(100), campus1)
      .input("Campus2", sql.NVarChar(100), campus2)
      .input("Position", sql.NVarChar(100), position)
      .input("Sector", sql.NVarChar(50), sector)
      .input("TONumber", sql.Int, tonumber)
      .input("Actor", sql.NVarChar(128), actor)
      .execute("dbo.Staff_Update");

    res.json({ success: true, staffId });
  } catch (err) {
    console.error("PUT /api/staff/:id failed:", err);

    const msg = String(err?.message || "");
    if (msg.includes("not found")) return res.status(404).json({ error: msg });
    if (msg.includes("already has that name")) return res.status(409).json({ error: msg });
    if (msg.includes("Name is required")) return res.status(400).json({ error: msg });

    res.status(500).json({ error: "Failed to update staff member." });
  }
});

/**
 * DELETE /api/staff/:id
 * Soft archive (NOT a hard delete)
 */
router.delete("/:id", async (req, res) => {
  try {
    const pool = await getPool();

    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId <= 0) {
      return res.status(400).json({ error: "Invalid StaffID." });
    }

    const actor = req.get("x-actor") || "webapp";

    await pool
      .request()
      .input("StaffID", sql.Int, staffId)
      .input("Actor", sql.NVarChar(128), actor)
      .execute("dbo.Staff_Archive");

    res.json({ success: true, staffId });
  } catch (err) {
    console.error("DELETE /api/staff/:id failed:", err);

    const msg = String(err?.message || "");
    if (msg.includes("not found")) return res.status(404).json({ error: msg });

    res.status(500).json({ error: "Failed to archive staff member." });
  }
});

router.patch("/:id/restore", async (req, res) => {
  try {
    const staffId = parseInt(req.params.id, 10);
    if (!Number.isFinite(staffId)) return res.status(400).json({ ok: false, error: "Bad StaffID" });

    const pool = await getPool();
    await pool.request()
      .input("StaffID", sql.Int, staffId)
      .input("ModifiedBy", sql.NVarChar(100), req.user?.name || "admin") // if you have it
      .execute("dbo.Staff_Restore"); // create/you already have?

    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/staff/:id/restore failed:", err);
    res.status(500).json({ ok: false, error: "Failed to restore staff." });
  }
});

module.exports = router;
