// public/staff.js
// Requires apiGet() and apiSend() already loaded globally.

(function () {
  const IDS = {
    // Filters (Records-style)
    search: "sm_search",
    includeArchived: "sm_includeArchived",
    sectorSel: "sm_sector",
    campusSel: "sm_campus",
    positionSel: "sm_position",
    clearBtn: "sm_clearBtn",
    toast: "sm_toast",

    // Table
    tbody: "sm_tbody",

    // Buttons
    addBtn: "sm_addBtn",

    // Modal
    modal: "sm_modal",
    modalTitle: "sm_modalTitle",
    saveBtn: "sm_saveBtn",
    cancelBtn: "sm_cancelBtn",
    archiveBtn: "sm_archiveBtn",

    // Modal fields
    f_id: "sm_edit_id",
    f_name: "sm_edit_name",
    f_campus1: "sm_edit_campus1",   // <select>
    f_campus2: "sm_edit_campus2",   // <select>
    f_position: "sm_edit_position", // <select>
    f_sector: "sm_edit_sector",     // <select>
    f_tonumber: "sm_edit_tonumber",
    modalStatus: "sm_edit_status",
  };

  const STATE = {
    rows: [],
    options: { campuses: [], positions: [], sectors: [] },
    inited: false,
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uniqSorted(arr) {
    return [...new Set((arr || [])
      .filter(Boolean)
      .map(v => String(v).trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function toast(msg, isError) {
    const t = $(IDS.toast);
    if (!t) return;
    t.textContent = msg || "";
    t.classList.toggle("show", !!msg);
    t.classList.toggle("error", !!isError);
    clearTimeout(toast._t);
    if (msg) toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function setModalStatus(msg, color) {
    const s = $(IDS.modalStatus);
    if (!s) return;
    s.textContent = msg || "";
    s.style.color = color || "";
  }

  function modalBusy(b) {
    const save = $(IDS.saveBtn);
    const cancel = $(IDS.cancelBtn);
    const arch = $(IDS.archiveBtn);
    if (save) save.disabled = !!b;
    if (cancel) cancel.disabled = !!b;
    if (arch) arch.disabled = !!b || arch.disabled; // preserve disabled if already archived
  }

  function openModal() { $(IDS.modal).hidden = false; }
  function closeModal() {
    $(IDS.modal).hidden = true;
    setModalStatus("", "");
  }

  // ---------- Select fillers ----------
  function fillSelectOptions(selectId, values, noneLabel = "(none)") {
    const sel = $(selectId);
    if (!sel) return;

    const current = sel.value;
    const opts = [`<option value="">${escapeHtml(noneLabel)}</option>`]
      .concat((values || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));

    sel.innerHTML = opts.join("");

    if (current && Array.from(sel.options).some(o => o.value === current)) {
      sel.value = current;
    }
  }

  function fillFilterSelect(selectId, values) {
    // Filters use "All" instead of "(none)"
    fillSelectOptions(selectId, values, "All");
  }

  // ---------- API ----------
  function buildStaffListUrl() {
    const p = new URLSearchParams();

    p.set("includeArchived", $(IDS.includeArchived)?.checked ? "1" : "0");

    const q = String($(IDS.search)?.value || "").trim();
    if (q) p.set("search", q);

    const sector = String($(IDS.sectorSel)?.value || "").trim();
    const campus = String($(IDS.campusSel)?.value || "").trim();
    const position = String($(IDS.positionSel)?.value || "").trim();

    if (sector) p.set("sector", sector);
    if (campus) p.set("campus", campus);
    if (position) p.set("position", position);

    return "/api/staff?" + p.toString();
  }

  async function fetchStaff(includeArchived) {
    const p = new URLSearchParams();
    p.set("includeArchived", includeArchived ? "1" : "0");
    const data = await apiGet("/api/staff?" + p.toString());
    return data?.rows || data?.staff || [];
  }

  async function loadStaff() {
    const url = buildStaffListUrl();
    const data = await apiGet(url);
    STATE.rows = data?.rows || data?.staff || [];
    renderTable();
  }

  // ---------- Table ----------
function actionButtons(staffId, isArchived) {
  const edit = `
    <button class="rowicon-btn" type="button" data-act="edit" data-id="${staffId}" title="Edit">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
          stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </button>`;

  const includeArchived = !!document.getElementById("sm_includeArchived")?.checked;

  if (isArchived) {
    if (includeArchived) {
      return `
        <div style="display:inline-flex; gap:8px; align-items:center;">
          ${edit}
          <button class="rowicon-btn" type="button" data-act="restore" data-id="${staffId}" title="Restore">
            Restore
          </button>
        </div>
      `;
    }
    return `<div style="display:inline-flex; gap:8px; align-items:center;">${edit}<span class="small-muted">Archived</span></div>`;
  }

  const archive = `
    <button class="rowicon-btn danger" type="button" data-act="archive" data-id="${staffId}" title="Archive">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M6 6l1 16h10l1-16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>`;

  return `<div style="display:inline-flex; gap:8px; align-items:center;">${edit}${archive}</div>`;
}


  function renderTable() {
    const tb = $(IDS.tbody);
    if (!tb) return;

    if (!STATE.rows.length) {
      tb.innerHTML = `<tr><td colspan="7"><em>No staff found.</em></td></tr>`;
      return;
    }

    tb.innerHTML = STATE.rows.map(s => {
      const isArchived = !!s.IsArchived;
      const to = (s.TONumber === null || s.TONumber === undefined) ? "" : String(s.TONumber);

      return `
        <tr class="${isArchived ? "row-archived" : ""}">
          <td>${escapeHtml(s.Name)}</td>
          <td>${escapeHtml(s.Campus1 || "")}</td>
          <td>${escapeHtml(s.Campus2 || "")}</td>
          <td>${escapeHtml(s.Position || "")}</td>
          <td>${escapeHtml(s.Sector || "")}</td>
          <td class="num">${escapeHtml(to)}</td>
          <td style="text-align:right;">${actionButtons(s.StaffID, isArchived)}</td>
        </tr>
      `;
    }).join("");
  }

  // ---------- Modal ----------
  function setModalTitle(t) { $(IDS.modalTitle).textContent = t || "Edit Staff"; }

  function setModalMode(isEdit, isArchived) {
    const archiveBtn = $(IDS.archiveBtn);
    if (!archiveBtn) return;

    archiveBtn.hidden = !isEdit;       // Add mode: hide Archive
    archiveBtn.disabled = !!isArchived; // Edit mode: disable if already archived
  }

  function fillModal(row) {
    // ensure modal option sets exist
    fillSelectOptions(IDS.f_campus1, STATE.options.campuses);
    fillSelectOptions(IDS.f_campus2, STATE.options.campuses);
    fillSelectOptions(IDS.f_position, STATE.options.positions);
    fillSelectOptions(IDS.f_sector, STATE.options.sectors);

    $(IDS.f_id).value = row?.StaffID ?? "";
    $(IDS.f_name).value = row?.Name ?? "";

    $(IDS.f_campus1).value = row?.Campus1 ?? "";
    $(IDS.f_campus2).value = row?.Campus2 ?? "";
    $(IDS.f_position).value = row?.Position ?? "";
    $(IDS.f_sector).value = row?.Sector ?? "";

    $(IDS.f_tonumber).value =
      row?.TONumber === null || row?.TONumber === undefined ? "" : String(row?.TONumber);

    const isEdit = !!String($(IDS.f_id).value || "").trim();
    const isArchived = !!row?.IsArchived;
    setModalMode(isEdit, isArchived);
  }

  function getModalPayload() {
    const tonumberRaw = String($(IDS.f_tonumber).value || "").trim();
    return {
      name: String($(IDS.f_name).value || "").trim(),
      campus1: String($(IDS.f_campus1).value || "").trim() || null,
      campus2: String($(IDS.f_campus2).value || "").trim() || null,
      position: String($(IDS.f_position).value || "").trim() || null,
      sector: String($(IDS.f_sector).value || "").trim() || null,
      tonumber: tonumberRaw === "" ? null : Number(tonumberRaw),
    };
  }

  function openAdd() {
    setModalTitle("Add Staff Member");
    fillModal({
      StaffID: "",
      Name: "",
      Campus1: "",
      Campus2: "",
      Position: "",
      Sector: "",
      TONumber: "",
      IsArchived: 0
    });
    setModalStatus("", "");
    openModal();
  }

  function openEdit(staffId) {
    const row = STATE.rows.find(r => Number(r.StaffID) === Number(staffId));
    if (!row) {
      toast("Staff member not found.", true);
      return;
    }
    setModalTitle(`Edit Staff – ${row.Name || ""}`);
    fillModal(row);
    setModalStatus("", "");
    openModal();
  }

  async function saveModal() {
    const id = String($(IDS.f_id).value || "").trim();
    const payload = getModalPayload();

    if (!payload.name) {
      setModalStatus("Name is required.", "red");
      return;
    }
    if (payload.tonumber !== null && !Number.isFinite(payload.tonumber)) {
      setModalStatus("TO Number must be a number.", "red");
      return;
    }

    modalBusy(true);
    setModalStatus("Saving…", "#666");
    try {
      if (!id) {
        await apiSend("/api/staff", "POST", payload);
        toast("Staff added.", false);
      } else {
        await apiSend(`/api/staff/${encodeURIComponent(id)}`, "PUT", payload);
        toast("Staff updated.", false);
      }

      closeModal();

      // refresh filter + modal option sets (in case new values were added)
      await initOptions();
      await loadStaff();
    } catch (e) {
      const raw = String(e?.message || e);
      let msg = raw;
      try {
        const j = JSON.parse(raw);
        if (j?.error) msg = j.error;
      } catch {}
      setModalStatus(msg || "Save failed.", "red");
    } finally {
      modalBusy(false);
    }
  }

  async function archiveStaff(staffId) {
    const row = STATE.rows.find(r => Number(r.StaffID) === Number(staffId));
    const name = row?.Name || "this staff member";

    if (!confirm(`Archive ${name}?\n\nThey will be hidden from active staff lists. No data is deleted.`)) {
      return;
    }

    try {
      await apiSend(`/api/staff/${encodeURIComponent(staffId)}`, "DELETE");
      toast("Staff archived.", false);
      await loadStaff();
    } catch (e) {
      const raw = String(e?.message || e);
      let msg = raw;
      try {
        const j = JSON.parse(raw);
        if (j?.error) msg = j.error;
      } catch {}
      toast(msg || "Archive failed.", true);
    }
  }

  async function archiveFromModal() {
    const id = String($(IDS.f_id).value || "").trim();
    if (!id) return;
    await archiveStaff(id);
    closeModal();
  }

  // ---------- Options ----------
  async function initOptions() {
    // Build option sets from ALL staff (including archived) so options are stable
    const all = await fetchStaff(true);

    const campuses = uniqSorted(all.flatMap(s => [s.Campus1, s.Campus2]));
    const positions = uniqSorted(all.map(s => s.Position));
    const sectors = uniqSorted(all.map(s => s.Sector));

    STATE.options = { campuses, positions, sectors };

    // Filters (Records-style dropdowns)
    fillFilterSelect(IDS.sectorSel, sectors);
    fillFilterSelect(IDS.campusSel, campuses);
    fillFilterSelect(IDS.positionSel, positions);

    // Modal dropdowns (Add/Edit)
    fillSelectOptions(IDS.f_campus1, campuses);
    fillSelectOptions(IDS.f_campus2, campuses);
    fillSelectOptions(IDS.f_position, positions);
    fillSelectOptions(IDS.f_sector, sectors);
  }

  // ---------- Events ----------
  function bindEventsOnce() {
    if (STATE.inited) return;
    STATE.inited = true;

    // Filters (auto refresh)
    $(IDS.search).addEventListener("input", () =>
      loadStaff().catch(err => toast(String(err?.message || err), true))
    );
    $(IDS.includeArchived).addEventListener("change", () =>
      loadStaff().catch(err => toast(String(err?.message || err), true))
    );

    $(IDS.sectorSel).addEventListener("change", () =>
      loadStaff().catch(err => toast(String(err?.message || err), true))
    );
    $(IDS.campusSel).addEventListener("change", () =>
      loadStaff().catch(err => toast(String(err?.message || err), true))
    );
    $(IDS.positionSel).addEventListener("change", () =>
      loadStaff().catch(err => toast(String(err?.message || err), true))
    );

    // Clear (Records-style)
    $(IDS.clearBtn).addEventListener("click", async () => {
      $(IDS.search).value = "";
      $(IDS.includeArchived).checked = false;

      $(IDS.sectorSel).value = "";
      $(IDS.campusSel).value = "";
      $(IDS.positionSel).value = "";

      try {
        await loadStaff();
        toast("Cleared.", false);
      } catch (err) {
        toast(String(err?.message || err), true);
      }
    });

    // Table actions
    $(IDS.tbody).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (act === "edit") openEdit(id);
      if (act === "archive") archiveStaff(id);
      if (act === "restore") restoreStaff(id);
    });

    // Add
    $(IDS.addBtn).addEventListener("click", openAdd);

    // Modal close via backdrop/X
    $(IDS.modal).addEventListener("click", (e) => {
      if (e.target?.dataset?.close === "1") closeModal();
      if (e.target === $(IDS.modal)) closeModal();
    });
    $(IDS.modal).querySelectorAll("[data-close='1']").forEach(btn => {
      btn.addEventListener("click", closeModal);
    });

    // Modal actions
    $(IDS.saveBtn).addEventListener("click", saveModal);
    $(IDS.cancelBtn).addEventListener("click", closeModal);
    $(IDS.archiveBtn).addEventListener("click", archiveFromModal);

    // ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$(IDS.modal).hidden) closeModal();
    });
  }

  async function initStaffManager() {
    bindEventsOnce();
    await initOptions();
    await loadStaff();
  }
async function restoreStaff(staffId) {
  const row = STATE.rows.find(r => Number(r.StaffID) === Number(staffId));
  const name = row?.Name || "this staff member";

  if (!confirm(`Restore ${name}?\n\nThey will become active again.`)) return;

  try {
    await apiSend(`/api/staff/${encodeURIComponent(staffId)}/restore`, "PATCH");
    toast("Staff restored.", false);
    await loadStaff();
  } catch (e) {
    const raw = String(e?.message || e);
    let msg = raw;
    try { const j = JSON.parse(raw); if (j?.error) msg = j.error; } catch {}
    toast(msg || "Restore failed.", true);
  }
}

  window.initStaffManager = initStaffManager;
})();
