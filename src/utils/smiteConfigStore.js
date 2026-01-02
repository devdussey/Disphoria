const { ensureFileSync, writeJson, readJsonSync } = require('./dataDir');

const STORE_FILE = 'smite_config.json';
let cache = null;

function normaliseRoleIds(roleIds) {
  if (!Array.isArray(roleIds)) return [];
  const seen = new Set();
  for (const raw of roleIds) {
    if (!raw) continue;
    const id = String(raw);
    if (id) seen.add(id);
  }
  return Array.from(seen);
}

function ensureStore() {
  ensureFileSync(STORE_FILE, { guilds: {} });
}

function loadStore() {
  if (cache) return cache;
  ensureStore();
  try {
    const data = readJsonSync(STORE_FILE, { guilds: {} });
    if (!data || typeof data !== 'object') {
      cache = { guilds: {} };
    } else {
      if (!data.guilds || typeof data.guilds !== 'object') data.guilds = {};
      cache = data;
    }
  } catch (err) {
    console.error('Failed to load smite config store', err);
    cache = { guilds: {} };
  }
  return cache;
}

async function saveStore() {
  const store = loadStore();
  const safe = store && typeof store === 'object' ? store : { guilds: {} };
  if (!safe.guilds || typeof safe.guilds !== 'object') safe.guilds = {};
  await writeJson(STORE_FILE, safe);
}

function getGuildRecord(guildId) {
  const store = loadStore();
  if (!store.guilds[guildId] || typeof store.guilds[guildId] !== 'object') {
    store.guilds[guildId] = { enabled: true, immuneRoleIds: [] };
  }
  const guild = store.guilds[guildId];
  if (typeof guild.enabled !== 'boolean') guild.enabled = true;
  if (!Array.isArray(guild.immuneRoleIds)) guild.immuneRoleIds = [];
  guild.immuneRoleIds = normaliseRoleIds(guild.immuneRoleIds);
  return guild;
}

function getConfig(guildId) {
  if (!guildId) {
    return { enabled: true, updatedAt: null, immuneRoleIds: [] };
  }
  const guild = getGuildRecord(guildId);
  return {
    enabled: guild.enabled !== false,
    updatedAt: guild.updatedAt ?? null,
    immuneRoleIds: guild.immuneRoleIds || [],
  };
}

function isEnabled(guildId) {
  return getConfig(guildId).enabled;
}

function getImmuneRoleIds(guildId) {
  return getConfig(guildId).immuneRoleIds;
}

async function setEnabled(guildId, enabled) {
  if (!guildId) {
    return { enabled: true, updatedAt: null, immuneRoleIds: [] };
  }
  const store = loadStore();
  const current = getGuildRecord(guildId);
  store.guilds[guildId] = {
    ...current,
    enabled: !!enabled,
    updatedAt: new Date().toISOString(),
  };
  await saveStore();
  return getConfig(guildId);
}

async function setImmuneRoleIds(guildId, roleIds) {
  if (!guildId) return { enabled: true, updatedAt: null, immuneRoleIds: [] };
  const store = loadStore();
  const current = getGuildRecord(guildId);
  store.guilds[guildId] = {
    ...current,
    immuneRoleIds: normaliseRoleIds(roleIds),
    updatedAt: new Date().toISOString(),
  };
  await saveStore();
  return getConfig(guildId);
}

async function addImmuneRole(guildId, roleId) {
  if (!guildId || !roleId) return getConfig(guildId);
  const current = getGuildRecord(guildId);
  const updated = normaliseRoleIds([...current.immuneRoleIds, roleId]);
  return setImmuneRoleIds(guildId, updated);
}

async function removeImmuneRole(guildId, roleId) {
  if (!guildId || !roleId) return getConfig(guildId);
  const current = getGuildRecord(guildId);
  const updated = current.immuneRoleIds.filter(id => String(id) !== String(roleId));
  return setImmuneRoleIds(guildId, updated);
}

function clearCache() {
  cache = null;
}

module.exports = {
  getConfig,
  isEnabled,
  getImmuneRoleIds,
  setEnabled,
  setImmuneRoleIds,
  addImmuneRole,
  removeImmuneRole,
  clearCache,
};
