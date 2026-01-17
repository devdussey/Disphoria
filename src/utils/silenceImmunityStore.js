const fs = require('fs');
const { ensureFileSync, resolveDataPath, writeJsonSync, writeJson } = require('./dataDir');

const STORE_FILE = 'silence_immunity.json';
const DEFAULT_STORE = { guilds: {} };

let cache = null;

function getStorePath() {
  return resolveDataPath(STORE_FILE);
}

function loadStore() {
  if (cache) return cache;
  try {
    ensureFileSync(STORE_FILE, DEFAULT_STORE);
    const raw = fs.readFileSync(getStorePath(), 'utf8');
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      cache = { ...DEFAULT_STORE };
    } else {
      cache = { ...DEFAULT_STORE, ...parsed };
      if (!cache.guilds || typeof cache.guilds !== 'object') cache.guilds = {};
    }
  } catch (err) {
    console.error('Failed to load silence immunity store:', err);
    cache = { ...DEFAULT_STORE };
  }
  return cache;
}

async function saveStore() {
  const safe = cache && typeof cache === 'object' ? cache : { ...DEFAULT_STORE };
  if (!safe.guilds || typeof safe.guilds !== 'object') safe.guilds = {};
  try {
    await writeJson(STORE_FILE, safe);
  } catch (err) {
    console.error('Failed to save silence immunity store:', err);
  }
}

function ensureGuild(guildId) {
  const store = loadStore();
  if (!store.guilds[guildId] || typeof store.guilds[guildId] !== 'object') {
    store.guilds[guildId] = { users: {} };
  } else if (!store.guilds[guildId].users || typeof store.guilds[guildId].users !== 'object') {
    store.guilds[guildId].users = {};
  }
  return store.guilds[guildId];
}

function getExpiry(guildId, userId) {
  const guild = ensureGuild(guildId);
  const ts = guild.users[userId];
  if (!Number.isFinite(ts)) return null;
  if (ts <= Date.now()) return null;
  return ts;
}

function getRemainingMs(guildId, userId) {
  const guild = ensureGuild(guildId);
  const ts = guild.users[userId];
  if (!Number.isFinite(ts)) return 0;
  const now = Date.now();
  if (ts <= now) {
    delete guild.users[userId];
    try { writeJsonSync(STORE_FILE, cache || DEFAULT_STORE); } catch (_) {}
    return 0;
  }
  return ts - now;
}

async function recordSilence(guildId, userId, timeoutDurationMs, bufferMs = 10 * 60_000) {
  if (!guildId || !userId) return null;
  const guild = ensureGuild(guildId);
  const duration = Math.max(0, Number(timeoutDurationMs) || 0);
  const buffer = Math.max(0, Number(bufferMs) || 0);
  const expiry = Date.now() + duration + buffer;
  guild.users[userId] = expiry;
  await saveStore();
  return expiry;
}

module.exports = {
  getRemainingMs,
  recordSilence,
};
