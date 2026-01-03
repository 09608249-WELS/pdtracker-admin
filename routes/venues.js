// routes/venues.js
const express = require("express");
const router = express.Router();
const { getPool } = require("../db");

router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT VenueID, VenueName
      FROM dbo.Venue
      ORDER BY VenueName;
    `);

    res.json({ ok: true, venues: r.recordset || [] });
  } catch (err) {
    console.error("GET /api/venues failed:", err);
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
