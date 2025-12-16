// Store for per-guild log routing by log key.
// Backed by MySQL when configured; falls back to JSON file storage.
// Structure: { guildId: { logKey: { channelId, enabled }, ... } }

const fs = require('fs').promises;
const { ensureFile, resolveDataPath, writeJson } = require('./dataDir');
const { ALL_KEYS, isValidLogKey } = require('./logEvents');
const { getMysqlPool, ensureTable } = require('./mysqlPool');

const STORE_FILE = 'logchanneltypes.json';
const TABLE_NAME = 'guild_log_routes';
const DEFAULT_ENTRY = { channelId: null, enabled: true };

const LOG_TYPES = Object.freeze(Object.fromEntries(ALL_KEYS.map(key => [key, key])));

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`${TABLE_NAME}\` (
  guild_id VARCHAR(32) NOT NULL,
  log_key VARCHAR(64) NOT NULL,
  channel_id VARCHAR(32) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, log_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

function getDataFile() {
  return resolveDataPath(STORE_FILE);
}

function normalizeEntry(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    return {
      channelId: value ? String(value) : null,
      enabled: true,
    };
  }
  if (value && typeof value === 'object') {
    const { channelId, enabled } = value;
    return {
      channelId: (typeof channelId === 'string' || typeof channelId === 'number') ? String(channelId) : null,
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_ENTRY.enabled,
    };
  }
  return { ...DEFAULT_ENTRY };
}

function ensureGuildId(guildId) {
  return guildId ? String(guildId) : null;
}

let fileCache = null;
let dbCache = new Map(); // guildId -> { loadedAt, entries }
const DB_CACHE_TTL_MS = 30_000;
let mysqlUnavailableUntil = 0;
let mysqlLastErrorLogAt = 0;
const MYSQL_BACKOFF_MS = 60_000;
const MYSQL_ERROR_LOG_THROTTLE_MS = 30_000;

async function ensureFileLoaded() {
  if (fileCache) return;
  try {
    await ensureFile(STORE_FILE, '{}');
    const raw = await fs.readFile(getDataFile(), 'utf8').catch(err => {
      if (err?.code === 'ENOENT') return '{}';
      throw err;
    });
    const parsed = JSON.parse(raw || '{}');
    fileCache = (parsed && typeof parsed === 'object') ? parsed : {};
    for (const gid of Object.keys(fileCache)) {
      const guildData = fileCache[gid];
      if (!guildData || typeof guildData !== 'object') {
        fileCache[gid] = {};
        continue;
      }
      for (const key of Object.keys(guildData)) {
        guildData[key] = normalizeEntry(guildData[key]);
      }
    }
  } catch (err) {
    console.error('Failed to load log channel type store:', err);
    fileCache = {};
  }
}

async function persistFile() {
  try {
    const safe = fileCache && typeof fileCache === 'object' ? fileCache : {};
    await writeJson(STORE_FILE, safe);
  } catch (err) {
    console.error('Failed to write log channel type store:', err);
  }
}

async function getDbPoolReady() {
  if (mysqlUnavailableUntil && Date.now() < mysqlUnavailableUntil) return null;

  const pool = getMysqlPool();
  if (!pool) return null;
  try {
    await ensureTable(pool, TABLE_NAME, CREATE_TABLE_SQL);
    mysqlUnavailableUntil = 0;
    return pool;
  } catch (err) {
    const now = Date.now();
    mysqlUnavailableUntil = now + MYSQL_BACKOFF_MS;
    if ((now - mysqlLastErrorLogAt) >= MYSQL_ERROR_LOG_THROTTLE_MS) {
      mysqlLastErrorLogAt = now;
      console.error('Failed to ensure MySQL log routing table:', err?.message || err);
    }
    return null;
  }
}

function getDbGuildCache(guildId) {
  const cached = dbCache.get(guildId);
  if (!cached) return null;
  if ((Date.now() - cached.loadedAt) > DB_CACHE_TTL_MS) {
    dbCache.delete(guildId);
    return null;
  }
  return cached.entries;
}

function setDbGuildCache(guildId, entries) {
  dbCache.set(guildId, { loadedAt: Date.now(), entries });
}

function updateDbGuildCacheEntry(guildId, logKey, entry) {
  const entries = getDbGuildCache(guildId);
  if (!entries) return;
  entries[logKey] = entry ? { ...entry } : normalizeEntry(null);
  setDbGuildCache(guildId, entries);
}

async function ensureFileEntry(guildId, logKey) {
  if (!isValidLogKey(logKey)) return null;
  await ensureFileLoaded();
  if (!fileCache[guildId]) fileCache[guildId] = {};
  const existing = fileCache[guildId][logKey];
  fileCache[guildId][logKey] = normalizeEntry(existing);
  return fileCache[guildId][logKey];
}

async function ensureFileAllEntries(guildId) {
  await ensureFileLoaded();
  for (const logKey of ALL_KEYS) {
    // eslint-disable-next-line no-await-in-loop
    await ensureFileEntry(guildId, logKey);
  }
}

async function getAllFromDb(guildId) {
  const pool = await getDbPoolReady();
  if (!pool) return null;

  const cached = getDbGuildCache(guildId);
  if (cached) return { ...cached };

  try {
    const [rows] = await pool.query(
      `SELECT log_key AS logKey, channel_id AS channelId, enabled FROM \`${TABLE_NAME}\` WHERE guild_id = ?`,
      [guildId]
    );
    const entries = {};
    for (const key of ALL_KEYS) entries[key] = normalizeEntry(null);
    for (const row of rows || []) {
      if (!isValidLogKey(row.logKey)) continue;
      entries[row.logKey] = normalizeEntry({
        channelId: row.channelId,
        enabled: row.enabled === 1 || row.enabled === true,
      });
    }
    setDbGuildCache(guildId, entries);
    return { ...entries };
  } catch (err) {
    console.error('Failed to read log routing from MySQL:', err?.message || err);
    return null;
  }
}

async function getEntryFromDb(guildId, logKey) {
  const entries = await getAllFromDb(guildId);
  if (!entries) return null;
  return entries[logKey] ? { ...entries[logKey] } : normalizeEntry(null);
}

async function upsertChannelDb(guildId, logKey, channelId) {
  const pool = await getDbPoolReady();
  if (!pool) return null;
  const channel = channelId ? String(channelId) : null;
  try {
    await pool.query(
      `INSERT INTO \`${TABLE_NAME}\` (guild_id, log_key, channel_id, enabled)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)`,
      [guildId, logKey, channel]
    );
    dbCache.delete(guildId);
    return await getEntryFromDb(guildId, logKey);
  } catch (err) {
    console.error('Failed to update log channel in MySQL:', err?.message || err);
    return null;
  }
}

async function upsertEnabledDb(guildId, logKey, enabled) {
  const pool = await getDbPoolReady();
  if (!pool) return null;
  const value = enabled ? 1 : 0;
  try {
    await pool.query(
      `INSERT INTO \`${TABLE_NAME}\` (guild_id, log_key, channel_id, enabled)
       VALUES (?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [guildId, logKey, value]
    );
    dbCache.delete(guildId);
    return await getEntryFromDb(guildId, logKey);
  } catch (err) {
    console.error('Failed to update log enabled flag in MySQL:', err?.message || err);
    return null;
  }
}

async function setChannel(guildIdInput, logKey, channelId) {
  const guildId = ensureGuildId(guildIdInput);
  if (!guildId || !isValidLogKey(logKey)) return null;

  const dbResult = await upsertChannelDb(guildId, logKey, channelId);
  if (dbResult) return dbResult;

  const entry = await ensureFileEntry(guildId, logKey);
  if (!entry) return null;
  entry.channelId = channelId ? String(channelId) : null;
  await persistFile();
  return { ...entry };
}

async function getChannel(guildId, logKey) {
  const entry = await getEntry(guildId, logKey);
  return entry?.channelId || null;
}

async function setEnabled(guildIdInput, logKey, enabled) {
  const guildId = ensureGuildId(guildIdInput);
  if (!guildId || !isValidLogKey(logKey)) return null;

  const dbResult = await upsertEnabledDb(guildId, logKey, enabled);
  if (dbResult) return dbResult;

  const entry = await ensureFileEntry(guildId, logKey);
  if (!entry) return null;
  entry.enabled = Boolean(enabled);
  await persistFile();
  return { ...entry };
}

async function getEnabled(guildId, logKey) {
  const entry = await getEntry(guildId, logKey);
  return entry?.enabled ?? DEFAULT_ENTRY.enabled;
}

async function getEntry(guildIdInput, logKey) {
  const guildId = ensureGuildId(guildIdInput);
  if (!guildId || !isValidLogKey(logKey)) return null;

  const dbEntry = await getEntryFromDb(guildId, logKey);
  if (dbEntry) return dbEntry;

  await ensureFileEntry(guildId, logKey);
  return fileCache[guildId]?.[logKey] ? { ...fileCache[guildId][logKey] } : normalizeEntry(null);
}

async function getAll(guildIdInput) {
  const guildId = ensureGuildId(guildIdInput);
  if (!guildId) return {};

  const fromDb = await getAllFromDb(guildId);
  if (fromDb) return fromDb;

  await ensureFileLoaded();
  await ensureFileAllEntries(guildId);
  const result = {};
  for (const logKey of ALL_KEYS) {
    const entry = fileCache[guildId]?.[logKey];
    result[logKey] = entry ? { ...entry } : normalizeEntry(null);
  }
  return result;
}

async function removeChannel(guildIdInput, logKey) {
  return Boolean(await setChannel(guildIdInput, logKey, null));
}

async function clearGuild(guildIdInput) {
  const guildId = ensureGuildId(guildIdInput);
  if (!guildId) return false;

  const pool = await getDbPoolReady();
  if (pool) {
    try {
      await pool.query(`DELETE FROM \`${TABLE_NAME}\` WHERE guild_id = ?`, [guildId]);
      dbCache.delete(guildId);
      return true;
    } catch (err) {
      console.error('Failed to clear guild log routing in MySQL:', err?.message || err);
    }
  }

  await ensureFileLoaded();
  delete fileCache[guildId];
  await persistFile();
  return true;
}

module.exports = {
  LOG_TYPES,
  setChannel,
  getChannel,
  getAll,
  removeChannel,
  clearGuild,
  setEnabled,
  getEnabled,
  getEntry,
};
