const fs = require('fs/promises');
const { ensureFile, resolveDataPath, writeJson } = require('./dataDir');

const STORE_FILE = 'rupeeCustomRoles.json';

let cache = null;
let saveTimer = null;

async function ensureStore() {
  await ensureFile(STORE_FILE, { guilds: {} });
}

async function load() {
  if (cache) return cache;
  await ensureStore();
  try {
    const raw = await fs.readFile(resolveDataPath(STORE_FILE), 'utf8');
    const parsed = raw ? JSON.parse(raw) : { guilds: {} };
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    cache = parsed;
  } catch (err) {
    console.error('Failed to load rupee custom role store:', err);
    cache = { guilds: {} };
  }
  return cache;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!cache) return;
    try {
      if (!cache.guilds || typeof cache.guilds !== 'object') cache.guilds = {};
      await writeJson(STORE_FILE, cache);
    } catch (err) {
      console.error('Failed to persist rupee custom role store:', err);
    }
  }, 100);
}

function getGuild(data, guildId) {
  if (!data.guilds[guildId]) data.guilds[guildId] = { users: {} };
  const entry = data.guilds[guildId];
  if (!entry.users || typeof entry.users !== 'object') entry.users = {};
  return entry;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.roleId && typeof entry.roleId !== 'string') entry.roleId = String(entry.roleId);
  if (!Array.isArray(entry.colors)) entry.colors = [];
  return entry;
}

module.exports = {
  async get(guildId, userId) {
    if (!guildId || !userId) return null;
    const data = await load();
    const guild = getGuild(data, guildId);
    const entry = normalizeEntry(guild.users[userId]);
    return entry ? { ...entry } : null;
  },

  async set(guildId, userId, record) {
    if (!guildId || !userId || !record || typeof record !== 'object') return;
    const data = await load();
    const guild = getGuild(data, guildId);
    guild.users[userId] = {
      roleId: record.roleId || null,
      mode: record.mode || null,
      colors: Array.isArray(record.colors) ? record.colors.slice(0, 3) : [],
      name: record.name || null,
    };
    scheduleSave();
  },

  async delete(guildId, userId) {
    if (!guildId || !userId) return;
    const data = await load();
    const guild = getGuild(data, guildId);
    if (guild.users[userId]) {
      delete guild.users[userId];
      scheduleSave();
    }
  },
};
