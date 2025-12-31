const { ensureFileSync, readJsonSync, writeJson } = require('./dataDir');

const STORE_FILE = 'wraith_presets.json';
const MAX_PRESETS_PER_OWNER = 25;

let cache = null;

function ensureStore() {
  ensureFileSync(STORE_FILE, { owners: {} });
}

function loadStore() {
  if (cache) return cache;
  ensureStore();
  try {
    const data = readJsonSync(STORE_FILE, { owners: {} });
    if (!data || typeof data !== 'object') {
      cache = { owners: {} };
    } else {
      if (!data.owners || typeof data.owners !== 'object') data.owners = {};
      cache = data;
    }
  } catch (err) {
    console.error('Failed to load wraith preset store', err);
    cache = { owners: {} };
  }
  return cache;
}

async function saveStore() {
  const store = loadStore();
  const safe = store && typeof store === 'object' ? store : { owners: {} };
  if (!safe.owners || typeof safe.owners !== 'object') safe.owners = {};
  await writeJson(STORE_FILE, safe);
}

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

function sanitizeName(name) {
  return String(name || '').trim().slice(0, 50);
}

function getOwnerRecord(ownerId) {
  const store = loadStore();
  if (!store.owners[ownerId] || typeof store.owners[ownerId] !== 'object') {
    store.owners[ownerId] = { presets: {}, default: null };
  }
  const owner = store.owners[ownerId];
  if (!owner.presets || typeof owner.presets !== 'object') owner.presets = {};
  if (typeof owner.default !== 'string') owner.default = null;
  return owner;
}

function listPresets(ownerId) {
  const owner = getOwnerRecord(ownerId);
  return Object.entries(owner.presets).map(([key, preset]) => ({ key, ...preset }));
}

function getPreset(ownerId, name) {
  if (!ownerId || !name) return null;
  const owner = getOwnerRecord(ownerId);
  const key = normalizeKey(name);
  if (!key) return null;
  const preset = owner.presets[key];
  return preset ? { key, ...preset } : null;
}

function getDefaultKey(ownerId) {
  const owner = getOwnerRecord(ownerId);
  if (owner.default && owner.presets[owner.default]) return owner.default;
  if (owner.default && !owner.presets[owner.default]) owner.default = null;
  return null;
}

function getDefaultPreset(ownerId) {
  const key = getDefaultKey(ownerId);
  if (!key) return null;
  const owner = getOwnerRecord(ownerId);
  const preset = owner.presets[key];
  return preset ? { key, ...preset } : null;
}

async function setDefaultPreset(ownerId, name) {
  const owner = getOwnerRecord(ownerId);
  const key = normalizeKey(name);
  if (!key || !owner.presets[key]) return false;
  owner.default = key;
  await saveStore();
  return true;
}

async function clearDefaultPreset(ownerId) {
  const owner = getOwnerRecord(ownerId);
  owner.default = null;
  await saveStore();
}

async function savePreset(ownerId, name, presetData, makeDefault = false) {
  if (!ownerId) throw new Error('Missing owner id.');
  const owner = getOwnerRecord(ownerId);
  const key = normalizeKey(name);
  if (!key) throw new Error('Preset name is required.');

  const now = new Date().toISOString();
  const existing = owner.presets[key];
  if (!existing && Object.keys(owner.presets).length >= MAX_PRESETS_PER_OWNER) {
    throw new Error(`You can only store up to ${MAX_PRESETS_PER_OWNER} presets.`);
  }

  owner.presets[key] = {
    name: sanitizeName(name),
    message: presetData.message,
    durationStr: presetData.durationStr ?? null,
    intervalSec: presetData.intervalSec ?? null,
    maxMessages: presetData.maxMessages ?? null,
    hideOthers: typeof presetData.hideOthers === 'boolean' ? presetData.hideOthers : null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (makeDefault) {
    owner.default = key;
  } else if (owner.default && !owner.presets[owner.default]) {
    owner.default = null;
  }
  await saveStore();
  return { key, ...owner.presets[key] };
}

async function deletePreset(ownerId, name) {
  const owner = getOwnerRecord(ownerId);
  const key = normalizeKey(name);
  if (!key || !owner.presets[key]) return false;
  delete owner.presets[key];
  if (owner.default === key) owner.default = null;
  await saveStore();
  return true;
}

function clearCache() {
  cache = null;
}

module.exports = {
  listPresets,
  getPreset,
  getDefaultPreset,
  getDefaultKey,
  setDefaultPreset,
  clearDefaultPreset,
  savePreset,
  deletePreset,
  clearCache,
  MAX_PRESETS_PER_OWNER,
};
