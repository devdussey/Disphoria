const { ensureFile, writeJson, resolveDataPath } = require('./dataDir');
const fs = require('node:fs/promises');

const STORE_FILE = 'boosterRoleConfig.json';

let cache = null;
let saveTimer = null;

async function ensureStore() {
  try {
    await ensureFile(STORE_FILE, { guilds: {} });
  } catch (err) {
    console.error('Failed to ensure booster role config store:', err);
  }
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
    console.error('Failed to load booster role config store:', err);
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
      console.error('Failed to persist booster role config store:', err);
    }
  }, 100);
}

function getGuild(data, guildId) {
  if (!data.guilds[guildId] || typeof data.guilds[guildId] !== 'object') {
    data.guilds[guildId] = {};
  }
  return data.guilds[guildId];
}

module.exports = {
  async isEnabled(guildId) {
    if (!guildId) return true;
    const data = await load();
    const entry = getGuild(data, guildId);
    return typeof entry.enabled === 'boolean' ? entry.enabled : true;
  },

  async setEnabled(guildId, enabled) {
    if (!guildId) return;
    const data = await load();
    const entry = getGuild(data, guildId);
    entry.enabled = Boolean(enabled);
    scheduleSave();
    return entry.enabled;
  },

  async clear(guildId) {
    if (!guildId) return;
    const data = await load();
    if (!data.guilds[guildId]) return;
    delete data.guilds[guildId];
    scheduleSave();
  },

  async getPanel(guildId) {
    if (!guildId) return null;
    const data = await load();
    const entry = getGuild(data, guildId);
    const panel = entry.panel;
    if (!panel || typeof panel !== 'object') return null;
    const channelId = typeof panel.channelId === 'string' ? panel.channelId : null;
    const messageId = typeof panel.messageId === 'string' ? panel.messageId : null;
    if (!channelId) return null;
    return { channelId, messageId };
  },

  async setPanel(guildId, channelId, messageId) {
    if (!guildId || !channelId) return null;
    const data = await load();
    const entry = getGuild(data, guildId);
    if (!entry.panel || typeof entry.panel !== 'object') entry.panel = {};
    entry.panel.channelId = String(channelId);
    entry.panel.messageId = messageId ? String(messageId) : null;
    scheduleSave();
    return entry.panel;
  },

  async clearPanel(guildId) {
    if (!guildId) return;
    const data = await load();
    const entry = getGuild(data, guildId);
    if (!entry.panel) return;
    delete entry.panel;
    scheduleSave();
  },

  async setPanelMessage(guildId, messageId) {
    if (!guildId) return null;
    const data = await load();
    const entry = getGuild(data, guildId);
    if (!entry.panel || typeof entry.panel !== 'object') return null;
    entry.panel.messageId = messageId ? String(messageId) : null;
    scheduleSave();
    return entry.panel;
  },
};
