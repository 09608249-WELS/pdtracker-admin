/* public/records.js */

function qs(id) { return document.getElementById(id); }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fmtDateDMY(d){
  if (!d) return "";
  const s = String(d).slice(0,10); // YYYY-MM-DD
  const [y,m,day] = s.split("-");
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}
// For <input type="date">
function fmtDateISO(d){
  if (!d) return "";
  return String(d).slice(0,10); // yyyy-mm-dd
}
function fmtCurrencyAUD(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-AU", { style:"currency", currency:"AUD" });
}

/* -------------------------
   Icon SVGs (slick monochrome)
------------------------- */
const ICON_PENCIL = `
<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0L15.13 5.11l3.75 3.75 1.83-1.82z"/>
</svg>`;

const ICON_TRASH = `
<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"/>
</svg>`;

/* -------------------------
   Records state (MUST be before setMode/initRecords runs)
------------------------- */
const recState = {
  inited: false,
  page: 1,
  pageSize: 50,
  total: 0,
  rows: [],
  staff: [],
  areas: [],
  venues: [],
};

/* -------------------------
   API helpers
------------------------- */
async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiSend(url, method, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => ({}));
}

/* -------------------------
   debounce helper (auto filters)
------------------------- */
function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* -------------------------
   Records toast (bottom-right)
------------------------- */
function showRecToast(msg, kind = "ok") {
  const el = qs("rec_toast");
  if (!el) return;

  el.textContent = msg || "";
  el.classList.remove("show", "error");
  if (kind === "error") el.classList.add("error");

  requestAnimationFrame(() => el.classList.add("show"));

  clearTimeout(showRecToast._t);
  showRecToast._t = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

/* -------------------------
   Records mode
------------------------- */
function buildRecordsQuery(pageOverride) {
  const page = pageOverride ?? recState.page;
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(recState.pageSize));

  const from = qs("rec_from")?.value || "";
  const to = qs("rec_to")?.value || "";
  const staffId = qs("rec_staff")?.value || "";
  const areaId = qs("rec_area")?.value || "";
  const venueId = qs("rec_venue")?.value || "";
  const accrual = qs("rec_accrual")?.value || "";
  const q = (qs("rec_q")?.value || "").trim();

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (staffId) params.set("staffId", staffId);
  if (areaId) params.set("areaId", areaId);
  if (venueId) params.set("venueId", venueId);
  if (accrual === "0" || accrual === "1") params.set("accrual", accrual);
  if (q) params.set("q", q);

  return `/api/pdrecords?${params.toString()}`;
}

function renderRecordsTable() {
  const tbody = qs("rec_tbody");
  if (!tbody) return;

  if (!recState.rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><em>No results.</em></td></tr>`;
    qs("rec_pagerInfo").textContent = recState.total ? `0 of ${recState.total}` : "";
    qs("rec_prevBtn").disabled = true;
    qs("rec_nextBtn").disabled = true;
    return;
  }

  tbody.innerHTML = recState.rows.map(r => {
    const staffName = r.StaffNameCurrent || r.StaffNameSnapshot || "";
    return `
      <tr>
        <td>${escapeHtml(fmtDateDMY(r.StartDate))}</td>
        <td>${escapeHtml(staffName)}</td>
        <td>${escapeHtml(r.AreaName || "")}</td>
        <td>${escapeHtml(r.VenueDisplay || "")}</td>
        <td>${escapeHtml(r.Title || "")}</td>
        <td class="num">${escapeHtml(r.Hours ?? "")}</td>
        <td class="num">${escapeHtml(fmtCurrencyAUD(r.Total))}</td>
        <td>${r.IsAccrual ? "Yes" : "No"}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="rowicon-btn" data-edit="${r.PDRecordID}" title="Edit" aria-label="Edit">
            ${ICON_PENCIL}
          </button>
          <button type="button" class="rowicon-btn danger" data-del="${r.PDRecordID}" title="Delete" aria-label="Delete">
            ${ICON_TRASH}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  const startRow = (recState.page - 1) * recState.pageSize + 1;
  const endRow = startRow + recState.rows.length - 1;

  qs("rec_pagerInfo").textContent = `Showing ${startRow}-${endRow} of ${recState.total}`;
  qs("rec_prevBtn").disabled = recState.page <= 1;
  qs("rec_nextBtn").disabled = endRow >= recState.total;
}

async function loadRecords(pageOverride) {
  const page = pageOverride ?? recState.page;
  recState.page = page;

  const tbody = qs("rec_tbody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="9"><em>Loading…</em></td></tr>`;

  const data = await apiGet(buildRecordsQuery(page));
  recState.total = data.total || 0;
  recState.rows = data.rows || [];

  renderRecordsTable();
}

function showModal(show) {
  const modal = qs("rec_modal");
  if (!modal) return;
  modal.hidden = !show;

  const st = qs("rec_edit_status");
  if (st) st.textContent = "";

  if (!show) {
    const titleEl = qs("rec_modalTitle");
    if (titleEl) titleEl.textContent = "Edit PD Record";
  }
}

function syncVenueOtherEnabled() {
  const venueSel = qs("rec_edit_venue");
  const otherBox = qs("rec_edit_venueOther");
  if (!venueSel || !otherBox) return;

  const venueId = venueSel.value;
  const isOther = !venueId; // empty => Other
  otherBox.disabled = !isOther;
  if (!isOther) otherBox.value = "";
}

function openEditModal(id) {
  const r = recState.rows.find(x => Number(x.PDRecordID) === Number(id));
  if (!r) return;

  const staffName = r.StaffNameCurrent || r.StaffNameSnapshot || "Unknown Staff";
  const titleEl = qs("rec_modalTitle");
  if (titleEl) titleEl.textContent = `Edit PD Record – ${staffName}`;

  qs("rec_edit_id").value = String(id);
  qs("rec_edit_start").value = fmtDateISO(r.StartDate);
  qs("rec_edit_end").value = fmtDateISO(r.EndDate);
  qs("rec_edit_area").value = String(r.AreaID ?? "");
  qs("rec_edit_title").value = r.Title ?? "";

  qs("rec_edit_venue").value = r.VenueID ? String(r.VenueID) : "";
  qs("rec_edit_venueOther").value = r.VenueID ? "" : (r.VenueOther ?? "");

  qs("rec_edit_hours").value = r.Hours ?? "";
  qs("rec_edit_crt").value = r.CRT ?? "";
  qs("rec_edit_enrol").value = r.Enrol ?? "";
  qs("rec_edit_other").value = r.Other ?? "";
  qs("rec_edit_accrual").value = r.IsAccrual ? "1" : "0";

  syncVenueOtherEnabled();
  showModal(true);
}

async function initRecordsLookups() {
  const staffRes = await apiGet("/api/staff");
  recState.staff = staffRes.staff || [];

  const lookups = await apiGet("/api/lookups");
  recState.areas = lookups.areas || [];

  const venueRes = await apiGet("/api/venues");
  recState.venues = venueRes.venues || [];

  qs("rec_staff").innerHTML =
    `<option value="">All staff</option>` +
    recState.staff.map(s => `<option value="${s.StaffID}">${escapeHtml(s.Name)}</option>`).join("");

  qs("rec_area").innerHTML =
    `<option value="">All areas</option>` +
    recState.areas.map(a => `<option value="${a.AreaID}">${escapeHtml(a.AreaName)}</option>`).join("");

  qs("rec_venue").innerHTML =
    `<option value="">All venues</option>` +
    recState.venues.map(v => `<option value="${v.VenueID}">${escapeHtml(v.VenueName)}</option>`).join("");

  qs("rec_edit_area").innerHTML =
    recState.areas.map(a => `<option value="${a.AreaID}">${escapeHtml(a.AreaName)}</option>`).join("");

  qs("rec_edit_venue").innerHTML =
    `<option value="">Other (type below)</option>` +
    recState.venues.map(v => `<option value="${v.VenueID}">${escapeHtml(v.VenueName)}</option>`).join("");
}

async function initRecords() {
  if (recState.inited) return;
  recState.inited = true;

  // Delegated handler (tbody is stable even when rows re-render)
  const tbody = qs("rec_tbody");
  if (tbody) {
    tbody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-edit]");
      if (editBtn) {
        e.preventDefault();
        openEditModal(Number(editBtn.dataset.edit));
        return;
      }

      const delBtn = e.target.closest("[data-del]");
      if (delBtn) {
        e.preventDefault();
        const id = Number(delBtn.dataset.del);
        if (!id) return;
        if (!confirm("Soft delete this record?")) return;

        try {
          await apiSend(`/api/pdrecords/${id}`, "DELETE");
          await loadRecords(1);
          showRecToast("Deleted ✔");
        } catch (err) {
          console.error(err);
          alert("Delete failed.");
          showRecToast("Delete failed", "error");
        }
        return;
      }
    });
  }

  // modal close (backdrop or X)
  const modal = qs("rec_modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target?.dataset?.close === "1") showModal(false);
    });
  }

  // venue other toggle
  const venueSel = qs("rec_edit_venue");
  if (venueSel) venueSel.addEventListener("change", syncVenueOtherEnabled);

  // ✅ auto filters (Apply removed)
  const autoRefresh = debounce(() => loadRecords(1), 250);

  ["rec_from","rec_to","rec_staff","rec_area","rec_venue","rec_accrual"].forEach(id => {
    const el = qs(id);
    if (!el) return;
    el.addEventListener("change", autoRefresh);
  });

  const qEl = qs("rec_q");
  if (qEl) qEl.addEventListener("input", debounce(() => loadRecords(1), 350));

  // Clear filters
  const clearBtn = qs("rec_clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      qs("rec_from").value = "";
      qs("rec_to").value = "";
      qs("rec_staff").value = "";
      qs("rec_area").value = "";
      qs("rec_venue").value = "";
      qs("rec_accrual").value = "";
      qs("rec_q").value = "";
      loadRecords(1);
    });
  }

  // paging
  const prevBtn = qs("rec_prevBtn");
  if (prevBtn) prevBtn.addEventListener("click", () => loadRecords(recState.page - 1));

  const nextBtn = qs("rec_nextBtn");
  if (nextBtn) nextBtn.addEventListener("click", () => loadRecords(recState.page + 1));

  // save
  const saveBtn = qs("rec_saveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const id = Number(qs("rec_edit_id").value);

      const venueIdVal = qs("rec_edit_venue").value;
      const venueId = venueIdVal ? Number(venueIdVal) : null;
      const venueOther = venueId ? null : (qs("rec_edit_venueOther").value.trim() || null);

      const body = {
        StartDate: qs("rec_edit_start").value || null,
        EndDate: qs("rec_edit_end").value || null,
        AreaID: qs("rec_edit_area").value ? Number(qs("rec_edit_area").value) : null,
        Title: qs("rec_edit_title").value.trim() || null,
        VenueID: venueId,
        VenueOther: venueOther,
        Hours: qs("rec_edit_hours").value === "" ? null : Number(qs("rec_edit_hours").value),
        CRT: qs("rec_edit_crt").value === "" ? null : Number(qs("rec_edit_crt").value),
        Enrol: qs("rec_edit_enrol").value === "" ? null : Number(qs("rec_edit_enrol").value),
        Other: qs("rec_edit_other").value === "" ? null : Number(qs("rec_edit_other").value),
        IsAccrual: qs("rec_edit_accrual").value === "1",
      };

      if (!body.StartDate) return (qs("rec_edit_status").textContent = "Start Date is required.");
      if (!body.AreaID) return (qs("rec_edit_status").textContent = "Area is required.");
      if (!body.Title) return (qs("rec_edit_status").textContent = "Title is required.");
      if (!body.VenueID && !body.VenueOther)
        return (qs("rec_edit_status").textContent = "Venue Other is required when Venue is Other.");

      qs("rec_edit_status").textContent = "Saving…";
      try {
        await apiSend(`/api/pdrecords/${id}`, "PATCH", body);
        showModal(false);
        await loadRecords(recState.page);
        showRecToast("Saved ✔");
      } catch (e) {
        console.error(e);
        qs("rec_edit_status").textContent = "Save failed.";
        showRecToast("Save failed", "error");
      }
    });
  }

  // delete (modal)
  const deleteBtn = qs("rec_deleteBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const id = Number(qs("rec_edit_id").value);
      if (!confirm("Soft delete this record?")) return;

      qs("rec_edit_status").textContent = "Deleting…";
      try {
        await apiSend(`/api/pdrecords/${id}`, "DELETE");
        showModal(false);
        await loadRecords(1);
        showRecToast("Deleted ✔");
      } catch (e) {
        console.error(e);
        qs("rec_edit_status").textContent = "Delete failed.";
        showRecToast("Delete failed", "error");
      }
    });
  }

  // CSV export
  const csvBtn = qs("rec_exportCsvBtn");
  if (csvBtn) {
    csvBtn.addEventListener("click", async () => {
      const all = [];
      let page = 1;

      while (true) {
        const data = await apiGet(buildRecordsQuery(page));
        const rows = data.rows || [];
        all.push(...rows);
        if (all.length >= (data.total || 0) || rows.length === 0) break;
        page++;
        if (page > 2000) break;
      }

      const header = ["StartDate", "Staff", "Area", "Venue", "Title", "Hours", "Total", "Accrual"];
      const lines = [header.join(",")];

      for (const r of all) {
        const staffName = (r.StaffNameCurrent || r.StaffNameSnapshot || "").replaceAll('"', '""');
        const row = [
          fmtDateDMY(r.StartDate),
          `"${staffName}"`,
          `"${String(r.AreaName || "").replaceAll('"', '""')}"`,
          `"${String(r.VenueDisplay || "").replaceAll('"', '""')}"`,
          `"${String(r.Title || "").replaceAll('"', '""')}"`,
          r.Hours ?? "",
          r.Total ?? "",
          r.IsAccrual ? "Yes" : "No",
        ];
        lines.push(row.join(","));
      }

      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pd-records-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  // PDF certificates export (one page per staff)
  const pdfBtn = qs("rec_exportPdfBtn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      // build from the existing query, then strip paging for PDF
      const u = new URL(buildRecordsQuery(1), window.location.origin);
      u.searchParams.delete("page");
      u.searchParams.delete("pageSize");

      const url = `/api/pdrecords/certificates.pdf?${u.searchParams.toString()}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  await initRecordsLookups();
  await loadRecords(1);
}

/* -------------------------
   Mode system (MUST be after recState + initRecords exist)
------------------------- */
function setMode(mode) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  document.querySelectorAll(".mode-panel").forEach(p => p.hidden = (p.id !== `mode-${mode}`));
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  history.replaceState({}, "", url);

  if (mode === "records") {
    initRecords().catch(console.error);
  }
}

document.querySelectorAll(".tab").forEach(b => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
});

const initialMode = new URL(location.href).searchParams.get("mode") || "entry";
setMode(initialMode);
