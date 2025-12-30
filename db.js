// db.js
const sql = require("mssql");

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Check your .env file.`);
  return v;
}

const config = {
  user: required("SQL_USER"),
  password: required("SQL_PASSWORD"),
  server: "localhost",
  port: 1433,                      // ✅ TOP LEVEL (this was the fix)
  database: required("SQL_DATABASE"),
  options: {
    encrypt: true,                 // matches ODBC Driver 18 behaviour
    trustServerCertificate: true,  // local dev cert
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

module.exports = { sql, getPool };
