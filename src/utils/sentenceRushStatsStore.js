const fs = require('fs');
const { ensureFileSync, writeJsonSync } = require('./dataDir');

const STORE_FILE = 'sentencerush_stats.json';
const DEFAULT_STORE = { guilds: {} };

let cache = null;

function loadStore() {
  if (cache) return cache;
  try {
    const filePath = ensureFileSync(STORE_FILE, DEFAULT_STORE);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      cache = { ...DEFAULT_STORE };
    } else {
      cache = { ...DEFAULT_STORE, ...parsed };
      if (!cache.guilds || typeof cache.guilds !== 'object') cache.guilds = {};
    }
  } catch (err) {
    console.error('Failed to load SentenceRush stats store:', err);
    cache = { ...DEFAULT_STORE };
  }
  return cache;
}

function saveStore() {
  const store = loadStore();
  const safe = store && typeof store === 'object' ? store : { ...DEFAULT_STORE };
  if (!safe.guilds || typeof safe.guilds !== 'object') safe.guilds = {};
  writeJsonSync(STORE_FILE, safe);
}

function getGuildEntry(guildId) {
  const store = loadStore();
  if (!store.guilds[guildId] || typeof store.guilds[guildId] !== 'object') {
    store.guilds[guildId] = { players: {}, history: [] };
  }
  const entry = store.guilds[guildId];
  if (!entry.players || typeof entry.players !== 'object') entry.players = {};
  if (!Array.isArray(entry.history)) entry.history = [];
  return entry;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getStats(guildId, userId) {
  if (!guildId || !userId) return { wins: 0, gamesPlayed: 0, lastPlayedAt: 0 };
  const entry = getGuildEntry(guildId);
  const raw = entry.players[userId];
  if (!raw || typeof raw !== 'object') return { wins: 0, gamesPlayed: 0, lastPlayedAt: 0 };
  return {
    wins: toNumber(raw.wins),
    gamesPlayed: toNumber(raw.gamesPlayed),
    lastPlayedAt: toNumber(raw.lastPlayedAt),
  };
}

function recordGame(guildId, summary) {
  if (!guildId || !summary || typeof summary !== 'object') return null;
  const entry = getGuildEntry(guildId);
  const now = Date.now();

  const playerIds = Array.isArray(summary.playerIds)
    ? summary.playerIds.filter(Boolean)
    : [];

  const historyEntry = {
    winnerId: summary.winnerId || null,
    playerIds,
    sentence: summary.sentence || null,
    finishedAt: toNumber(summary.finishedAt) || now,
  };

  entry.history.push(historyEntry);
  if (entry.history.length > 50) entry.history.splice(0, entry.history.length - 50);

  for (const userId of playerIds) {
    const current = entry.players[userId] && typeof entry.players[userId] === 'object'
      ? entry.players[userId]
      : { wins: 0, gamesPlayed: 0, lastPlayedAt: 0 };

    const next = {
      wins: toNumber(current.wins),
      gamesPlayed: toNumber(current.gamesPlayed) + 1,
      lastPlayedAt: now,
    };

    if (summary.winnerId && userId === summary.winnerId) {
      next.wins += 1;
    }

    entry.players[userId] = next;
  }

  saveStore();
  return historyEntry;
}

function resetStatsCache() {
  cache = null;
}

module.exports = {
  getStats,
  recordGame,
  resetStatsCache,
};
