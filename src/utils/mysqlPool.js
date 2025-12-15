const mysql = require('mysql2/promise');

let pool = null;
let tableEnsured = new Set();

function getMysqlConfig() {
  const url = String(process.env.MYSQL_URL || '').trim();
  if (url) return { url };

  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  if (!host || !user || !database) return null;

  const password = String(process.env.MYSQL_PASSWORD || '');
  const portRaw = String(process.env.MYSQL_PORT || '').trim();
  const port = portRaw ? Number(portRaw) : 3306;

  return {
    host,
    user,
    password,
    database,
    port: Number.isFinite(port) ? port : 3306,
  };
}

function isMysqlConfigured() {
  return Boolean(getMysqlConfig());
}

function getMysqlPool() {
  const config = getMysqlConfig();
  if (!config) return null;
  if (pool) return pool;

  if (config.url) {
    pool = mysql.createPool(config.url);
  } else {
    pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return pool;
}

async function ensureTable(poolInstance, tableName, createSql) {
  if (!poolInstance) return false;
  if (!tableName || !createSql) return false;
  if (tableEnsured.has(tableName)) return true;

  await poolInstance.query(createSql);
  tableEnsured.add(tableName);
  return true;
}

module.exports = {
  getMysqlPool,
  isMysqlConfigured,
  ensureTable,
};

