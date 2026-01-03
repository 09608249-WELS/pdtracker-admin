
# PD Tracker – Admin Application

Admin system for recording staff Professional Development (PD) attendance,  
tracking accrual hours, and producing compliance-ready records.

This project replaces and extends an existing Google Apps Script solution and
uses **SQL Server Express** as the authoritative data store.

---

## Purpose

The PD Tracker allows administrators to:

- Record PD attendance for one or more staff members
- Store immutable snapshot data for historical accuracy
- View, filter, edit, and soft-delete PD records
- Prepare for future reporting, certificate generation, and accrual tracking

Designed for use in a **school environment** with audit and compliance needs.

---

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: Microsoft SQL Server Express
- **Language**: T-SQL (stored procedures + parameterised queries)
- **Frontend**: Vanilla HTML / CSS / JavaScript (no framework)
- **Driver**: `mssql` (Tedious)

---

## Architecture Overview

```

pdtracker-admin/
│
├─ server.js              # Express app entry point
├─ db.js                  # SQL Server connection pool
├─ routes/
│  ├─ pdrecords.js        # PD records API (GET, PATCH, DELETE)
│  ├─ staff.js            # Staff list API
│  ├─ venues.js           # Venue lookup API
│
├─ public/
│  ├─ index.html          # Admin UI (Entry + Records modes)
│  ├─ records.js          # Records mode JS (table, modal editor)
│  └─ styles.css          # Shared UI styling
│
├─ sql/
│  ├─ tables.sql          # Table definitions
│  ├─ types.sql           # TVP definitions
│  ├─ procedures.sql     # Stored procedures
│
└─ README.md

````

---

## Database

- **Instance**: `.\SQLEXPRESS`
- **Database**: `PDTracker`
- **Authentication**:
  - SQL login for app access
  - Login mapped to DB user
  - Permissions:
    - `db_datareader`
    - `db_datawriter`
    - `EXECUTE`

### Key Tables

- `dbo.Staff`
- `dbo.PDRecord`
- `dbo.Area`
- `dbo.Venue`
- `dbo.Sector`
- `dbo.Site`

### Design Notes

- PD records **snapshot staff names** at time of entry
- Venues use **either** `VenueID` **or** `VenueOther` (never both)
- Soft deletes used for audit safety
- Computed `Total` field used for cost aggregation

---

## Environment Variables

Create a `.env` file in the project root (not committed):

```env
SQL_USER=your_sql_user
SQL_PASSWORD=your_password
SQL_DATABASE=PDTracker
SQL_SERVER=localhost
PORT=3000
````

---

## Running Locally

1. Install Node.js
2. Install SQL Server Express + SSMS
3. Create database `PDTracker`
4. Run SQL scripts in `/sql` to create tables, types, and procedures
5. Install dependencies:

```bash
npm install
```

6. Start the server:

```bash
node server.js
```

7. Open in browser:

```
http://localhost:3000
```

---

## Implemented Modules

### ✅ PD Entry Mode

* Multi-staff selection with reusable filter UI
* Venue selection (lookup + Other)
* Accrual flag support
* Bulk insert via TVP

### ✅ Records Mode

* Filter by date, staff, area, venue, accrual
* Paging
* Inline edit modal
* Soft delete
* CSV export

---

## API Overview

### Read

* `GET /api/staff`
* `GET /api/lookups`
* `GET /api/venues`
* `GET /api/pdrecords`

### Write

* `POST /api/pdrecords`
* `PATCH /api/pdrecords/:id`
* `DELETE /api/pdrecords/:id` (soft delete)

---

## Roadmap

Planned next stages:

1. **PDF certificate generation**
2. **Accrual tracker**

   * Summarise accrual hours per staff member
3. **Staff manager**

   * Add / edit / archive staff records
4. **Deployment to school server**
5. Optional future Nuxt frontend

---

## Notes for Future Development

* UI filter system is canonical and reused across modules
* Prefer single-page “mode” system over separate pages
* Keep SQL logic inside stored procedures where practical
* Maintain soft-delete pattern for compliance

---

## Author

Built and maintained as part of internal school ICT systems.
