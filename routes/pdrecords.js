// routes/pdrecords.js
const express = require("express");
const router = express.Router();
const { sql, getPool } = require("../db");

// helpers
function parseIntSafe(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * GET /api/pdrecords
 * Query params:
 *  - from, to (YYYY-MM-DD)  (filters by StartDate)
 *  - staffId (int)
 *  - areaId (int)
 *  - venueId (int)
 *  - accrual (0|1)
 *  - q (title contains)
 *  - page (1..)
 *  - pageSize (1..200)
 */
router.get("/", async (req, res) => {
  try {
    const page = clamp(parseIntSafe(req.query.page, 1), 1, 1000000);
    const pageSize = clamp(parseIntSafe(req.query.pageSize, 50), 1, 200);
    const offset = (page - 1) * pageSize;

    const { from, to, staffId, areaId, venueId, accrual, q } = req.query;

    // Build WHERE safely (parameterized)
    const where = ["r.IsDeleted = 0"];
    const params = [];

    if (from) {
      where.push("r.StartDate >= @From");
      params.push({ name: "From", type: sql.Date, value: from });
    }
    if (to) {
      where.push("r.StartDate <= @To");
      params.push({ name: "To", type: sql.Date, value: to });
    }
    if (staffId) {
      const sid = parseIntSafe(staffId, null);
      if (sid) {
        where.push("r.StaffID = @StaffID");
        params.push({ name: "StaffID", type: sql.Int, value: sid });
      }
    }
    if (areaId) {
      const aid = parseIntSafe(areaId, null);
      if (aid) {
        where.push("r.AreaID = @AreaID");
        params.push({ name: "AreaID", type: sql.Int, value: aid });
      }
    }
    if (venueId) {
      const vid = parseIntSafe(venueId, null);
      if (vid) {
        where.push("r.VenueID = @VenueID");
        params.push({ name: "VenueID", type: sql.Int, value: vid });
      }
    }
    if (accrual === "0" || accrual === "1") {
      where.push("r.IsAccrual = @IsAccrual");
      params.push({ name: "IsAccrual", type: sql.Bit, value: accrual === "1" });
    }
    if (q && q.trim()) {
      where.push("r.Title LIKE @Q");
      params.push({ name: "Q", type: sql.NVarChar(200), value: `%${q.trim()}%` });
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const query = `
      /* Total count */
      SELECT COUNT_BIG(1) AS Total
      FROM dbo.PDRecord r
      ${whereSql};

      /* Page rows */
      SELECT
        r.PDRecordID,
        r.MeetingId,
        r.StaffID,
        r.StaffNameSnapshot,
        s.Name AS StaffNameCurrent,

        r.StartDate,
        r.EndDate,

        r.AreaID,
        a.AreaName,

        r.Title,

        r.VenueID,
        r.VenueOther,
        COALESCE(v.VenueName, r.VenueOther) AS VenueDisplay,

        r.Hours,
        r.CRT,
        r.Enrol,
        r.Other,
        r.Total,
        r.IsAccrual,
        r.AccrualHours,

        r.ModifiedAt,
        r.ModifiedBy
      FROM dbo.PDRecord r
      INNER JOIN dbo.Staff s ON s.StaffID = r.StaffID
      LEFT JOIN dbo.Area a ON a.AreaID = r.AreaID
      LEFT JOIN dbo.Venue v ON v.VenueID = r.VenueID
      ${whereSql}
      ORDER BY r.StartDate DESC, r.PDRecordID DESC
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
    `;

    const pool = await getPool();
    const request = pool.request();

    for (const p of params) request.input(p.name, p.type, p.value);
    request.input("Offset", sql.Int, offset);
    request.input("PageSize", sql.Int, pageSize);

    const result = await request.query(query);

    const total = result.recordsets?.[0]?.[0]?.Total ?? 0;
    const rows = result.recordsets?.[1] ?? [];

    res.json({
      page,
      pageSize,
      total: Number(total),
      rows,
    });
  } catch (err) {
    console.error("GET /api/pdrecords failed:", err);
    res.status(500).json({ error: "Failed to load PD records." });
  }
});

/**
 * PATCH /api/pdrecords/:id
 * Body: any of these fields:
 *  StartDate, EndDate, AreaID, Title, VenueID, VenueOther, Hours, CRT, Enrol, Other, IsAccrual, AccrualHours
 */
router.patch("/:id", async (req, res) => {
  try {
    const id = parseIntSafe(req.params.id, null);
    if (!id) return res.status(400).json({ error: "Invalid PDRecordID" });

    const pool = await getPool();
    const request = pool.request();

    request.input("PDRecordID", sql.BigInt, id);

    const hasVenueID = Object.prototype.hasOwnProperty.call(req.body, "VenueID");
    const hasVenueOther = Object.prototype.hasOwnProperty.call(req.body, "VenueOther");

    // Whitelist fields
    const allowed = {
      StartDate: { type: sql.Date, key: "StartDate" },
      EndDate: { type: sql.Date, key: "EndDate" },
      AreaID: { type: sql.Int, key: "AreaID" },
      Title: { type: sql.NVarChar(300), key: "Title" },

      VenueID: { type: sql.Int, key: "VenueID" },
      VenueOther: { type: sql.NVarChar(200), key: "VenueOther" },

      Hours: { type: sql.Decimal(5, 2), key: "Hours" },
      CRT: { type: sql.Decimal(10, 2), key: "CRT" },
      Enrol: { type: sql.Decimal(10, 2), key: "Enrol" },
      Other: { type: sql.Decimal(10, 2), key: "Other" },
      IsAccrual: { type: sql.Bit, key: "IsAccrual" },
      AccrualHours: { type: sql.Decimal(5, 2), key: "AccrualHours" },
    };

    const sets = [];

    // Build SET list (but handle VenueOther specially when VenueID is present)
    for (const [field, meta] of Object.entries(allowed)) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;

      // IMPORTANT: if VenueID is being edited, we will set VenueOther with CASE later
      if (hasVenueID && field === "VenueOther") continue;

      sets.push(`r.${meta.key} = @${field}`);
      request.input(field, meta.type, req.body[field]);
    }

    // Venue rule: single VenueOther assignment only
    if (hasVenueID) {
      // ensure params exist for CASE
      if (!Object.prototype.hasOwnProperty.call(req.body, "VenueID")) {
        request.input("VenueID", sql.Int, null);
      }
      if (!hasVenueOther) {
        request.input("VenueOther", sql.NVarChar(200), null);
      } else {
        // still bind VenueOther param even if it's null
        request.input("VenueOther", sql.NVarChar(200), req.body.VenueOther);
      }

      // Always include VenueID in SET if it was provided
      if (!sets.some(s => s.includes("r.VenueID"))) {
        sets.push("r.VenueID = @VenueID");
      }

      // Single assignment for VenueOther (no duplicates)
      sets.push("r.VenueOther = CASE WHEN @VenueID IS NULL THEN @VenueOther ELSE NULL END");
    }

    if (!sets.length) return res.status(400).json({ error: "No editable fields provided." });

    const user = req.header("x-user") || null;
    request.input("ModifiedBy", sql.NVarChar(128), user);

    const q = `
      UPDATE r
      SET
        ${sets.join(",\n        ")},
        r.ModifiedAt = SYSUTCDATETIME(),
        r.ModifiedBy = @ModifiedBy
      FROM dbo.PDRecord r
      WHERE r.PDRecordID = @PDRecordID AND r.IsDeleted = 0;

      IF @@ROWCOUNT = 0
        SELECT 0 AS Updated;
      ELSE
        SELECT 1 AS Updated;
    `;

    const result = await request.query(q);
    const updated = result.recordset?.[0]?.Updated === 1;

    if (!updated) return res.status(404).json({ error: "Record not found (or already deleted)." });

    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/pdrecords/:id failed:", err);
    res.status(500).json({ error: "Failed to update PD record." });
  }
});



/**
 * DELETE /api/pdrecords/:id  (soft delete)
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseIntSafe(req.params.id, null);
    if (!id) return res.status(400).json({ error: "Invalid PDRecordID" });

    const user = req.header("x-user") || null;

    const pool = await getPool();
    const request = pool.request();

    request.input("PDRecordID", sql.BigInt, id);
    request.input("DeletedBy", sql.NVarChar(128), user);

    const q = `
      UPDATE dbo.PDRecord
      SET
        IsDeleted = 1,
        DeletedAt = SYSUTCDATETIME(),
        DeletedBy = @DeletedBy
      WHERE PDRecordID = @PDRecordID AND IsDeleted = 0;

      IF @@ROWCOUNT = 0
        SELECT 0 AS Deleted;
      ELSE
        SELECT 1 AS Deleted;
    `;

    const result = await request.query(q);
    const deleted = result.recordset?.[0]?.Deleted === 1;

    if (!deleted) return res.status(404).json({ error: "Record not found (or already deleted)." });

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/pdrecords/:id failed:", err);
    res.status(500).json({ error: "Failed to delete PD record." });
  }
});

module.exports = router;
