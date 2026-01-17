const fs = require('fs');
const { ensureFileSync, resolveDataPath, writeJson } = require('./dataDir');

const STORE_FILE = 'automod_config.json';
const DEFAULT_CONFIG = { enabled: false, logChannelId: null, flags: [] };

let cache = null;

function ensureStore() {
  try {
    ensureFileSync(STORE_FILE, { guilds: {} });
  } catch (err) {
    console.error('Failed to ensure automod config store:', err);
  }
}

function loadStore() {
  if (cache) return cache;
  ensureStore();
  try {
    const raw = fs.readFileSync(resolveDataPath(STORE_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? parsed : { guilds: {} };
    if (!cache.guilds || typeof cache.guilds !== 'object') cache.guilds = {};
  } catch (_) {
    cache = { guilds: {} };
  }
  return cache;
}

function persist() {
  if (!cache || typeof cache !== 'object') cache = { guilds: {} };
  if (!cache.guilds || typeof cache.guilds !== 'object') cache.guilds = {};
  return writeJson(STORE_FILE, cache).catch(err => {
    console.error('Failed to save automod config store:', err);
  });
}

function getConfig(guildId) {
  const store = loadStore();
  const raw = store.guilds[guildId];
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const flags = Array.isArray(raw.flags) ? raw.flags.filter(f => typeof f === 'string' && f.trim()).map(f => f.trim()) : [];
  return {
    enabled: Boolean(raw.enabled),
    logChannelId: raw.logChannelId || null,
    flags,
  };
}

async function updateConfig(guildId, updates = {}) {
  const store = loadStore();
  if (!store.guilds[guildId] || typeof store.guilds[guildId] !== 'object') {
    store.guilds[guildId] = { ...DEFAULT_CONFIG };
  }
  const entry = store.guilds[guildId];
  if (typeof updates.enabled === 'boolean') entry.enabled = updates.enabled;
  if (typeof updates.logChannelId === 'string' || updates.logChannelId === null) {
    entry.logChannelId = updates.logChannelId;
  }
  if (Array.isArray(updates.flags)) {
    entry.flags = updates.flags
      .filter(f => typeof f === 'string')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  }
  await persist();
  return getConfig(guildId);
}

module.exports = {
  getConfig,
  updateConfig,
};
