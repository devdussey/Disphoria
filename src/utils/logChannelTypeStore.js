// Store for individual log channel types
// Structure: { guildId: { moderation: { channelId, enabled }, ... } }
const fs = require('fs').promises;
const { ensureFile, resolveDataPath, writeJson } = require('./dataDir');

const STORE_FILE = 'logchanneltypes.json';

function getDataFile() {
  return resolveDataPath(STORE_FILE);
}

const LOG_TYPES = {
  moderation: 'moderation',
  security: 'security',
  message: 'message',
  member: 'member',
  role: 'role',
  channel: 'channel',
  server: 'server',
  verification: 'verification',
  invite: 'invite',
  voice: 'voice',
  emoji: 'emoji',
  integration: 'integration',
  automod: 'automod',
  command: 'command',
  system: 'system',
};

const LOG_TYPE_VALUES = Object.values(LOG_TYPES);
const DEFAULT_ENTRY = { channelId: null, enabled: true };

let cache = null;

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

async function ensureLoaded() {
  if (cache) return;
  try {
    await ensureFile(STORE_FILE, '{}');
    const raw = await fs.readFile(getDataFile(), 'utf8').catch(err => {
      if (err?.code === 'ENOENT') return '{}';
      throw err;
    });
    const parsed = JSON.parse(raw || '{}');
    cache = (parsed && typeof parsed === 'object') ? parsed : {};
    for (const guildId of Object.keys(cache)) {
      const guildData = cache[guildId];
      if (!guildData || typeof guildData !== 'object') {
        cache[guildId] = {};
        continue;
      }
      for (const logType of Object.keys(guildData)) {
        guildData[logType] = normalizeEntry(guildData[logType]);
      }
    }
  } catch (err) {
    console.error('Failed to load log channel type store:', err);
    cache = {};
  }
}

async function persist() {
  try {
    const safe = cache && typeof cache === 'object' ? cache : {};
    await writeJson(STORE_FILE, safe);
  } catch (err) {
    console.error('Failed to write log channel type store:', err);
  }
}

function isValidLogType(logType) {
  return LOG_TYPE_VALUES.includes(logType);
}

async function ensureEntry(guildId, logType) {
  if (!isValidLogType(logType)) return null;
  await ensureLoaded();
  if (!cache[guildId]) cache[guildId] = {};
  const existing = cache[guildId][logType];
  cache[guildId][logType] = normalizeEntry(existing);
  return cache[guildId][logType];
}

async function ensureAllEntries(guildId) {
  await ensureLoaded();
  for (const logType of LOG_TYPE_VALUES) {
    await ensureEntry(guildId, logType);
  }
}

async function setChannel(guildId, logType, channelId) {
  const entry = await ensureEntry(guildId, logType);
  if (!entry) return null;
  entry.channelId = channelId ? String(channelId) : null;
  await persist();
  return entry;
}

async function getChannel(guildId, logType) {
  const entry = await getEntry(guildId, logType);
  return entry?.channelId || null;
}

async function setEnabled(guildId, logType, enabled) {
  const entry = await ensureEntry(guildId, logType);
  if (!entry) return null;
  entry.enabled = Boolean(enabled);
  await persist();
  return entry;
}

async function getEnabled(guildId, logType) {
  const entry = await getEntry(guildId, logType);
  return entry?.enabled ?? DEFAULT_ENTRY.enabled;
}

async function getEntry(guildId, logType) {
  if (!isValidLogType(logType)) return null;
  await ensureEntry(guildId, logType);
  return cache[guildId]?.[logType] ? { ...cache[guildId][logType] } : null;
}

async function getAll(guildId) {
  if (!guildId) return {};
  await ensureLoaded();
  await ensureAllEntries(guildId);
  const result = {};
  for (const logType of LOG_TYPE_VALUES) {
    const entry = cache[guildId]?.[logType];
    result[logType] = entry ? { ...entry } : normalizeEntry(null);
  }
  return result;
}

async function removeChannel(guildId, logType) {
  const entry = await ensureEntry(guildId, logType);
  if (!entry) return false;
  entry.channelId = null;
  await persist();
  return true;
}

async function clearGuild(guildId) {
  await ensureLoaded();
  delete cache[guildId];
  await persist();
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
  ensureEntry,
};
