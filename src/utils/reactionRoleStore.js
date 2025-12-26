const fs = require('fs');
const { ensureFileSync, resolveDataPath, writeJsonSync } = require('./dataDir');

const STORE_FILE = 'reaction_roles.json';

function getDataFile() {
    return resolveDataPath(STORE_FILE);
}

let cache = null;

function sanitiseOption(opt) {
    if (!opt || typeof opt !== 'object') return null;
    const roleId = String(opt.roleId || '').trim();
    if (!roleId) return null;
    const label = String(opt.label || '').trim().slice(0, 100);
    const description = opt.description ? String(opt.description).trim().slice(0, 100) : undefined;
    const value = String(opt.value || roleId).trim().slice(0, 100);
    const emoji = opt.emoji || undefined;
    if (!label || !value) return null;
    return { roleId, label, description, value, emoji };
}

function sanitisePanel(panel) {
    if (!panel || typeof panel !== 'object') return null;
    const cleaned = { ...panel };
    cleaned.id = String(cleaned.id || '');
    cleaned.creatorId = String(cleaned.creatorId || '');
    cleaned.channelId = cleaned.channelId ? String(cleaned.channelId) : null;
    cleaned.messageId = cleaned.messageId ? String(cleaned.messageId) : null;
    cleaned.placeholder = cleaned.placeholder ? String(cleaned.placeholder).slice(0, 100) : 'Choose your roles';
    cleaned.embed = cleaned.embed && typeof cleaned.embed === 'object' ? { ...cleaned.embed } : {};
    const opts = Array.isArray(cleaned.options) ? cleaned.options : [];
    cleaned.options = opts.map(sanitiseOption).filter(Boolean).slice(0, 25);
    cleaned.createdAt = Number.isFinite(cleaned.createdAt) ? cleaned.createdAt : Date.now();
    return cleaned.id && cleaned.creatorId && cleaned.options.length ? cleaned : null;
}

function ensureLoaded() {
    if (cache) return;
    try {
        ensureFileSync(STORE_FILE, JSON.stringify({ guilds: {} }, null, 2));
        const raw = fs.readFileSync(getDataFile(), 'utf8');
        cache = raw ? JSON.parse(raw) : { guilds: {} };
        if (!cache || typeof cache !== 'object') cache = { guilds: {} };
        if (!cache.guilds || typeof cache.guilds !== 'object') cache.guilds = {};
    } catch (err) {
        console.error('Failed to load reaction role store:', err);
        cache = { guilds: {} };
    }
}

function persist() {
    const safe = cache && typeof cache === 'object' ? cache : { guilds: {} };
    writeJsonSync(STORE_FILE, safe);
}

function ensureGuild(guildId) {
    ensureLoaded();
    const id = String(guildId);
    if (!cache.guilds[id]) {
        cache.guilds[id] = { nextPanelId: 1, panels: {} };
    }
    const guild = cache.guilds[id];
    if (!Number.isInteger(guild.nextPanelId) || guild.nextPanelId < 1) guild.nextPanelId = 1;
    if (!guild.panels || typeof guild.panels !== 'object') guild.panels = {};
    return guild;
}

function createPanel(guildId, panel) {
    const guild = ensureGuild(guildId);
    const id = String(guild.nextPanelId++);
    const stored = sanitisePanel({
        ...panel,
        id,
        guildId: String(guildId),
        createdAt: Date.now(),
    });
    if (!stored) throw new Error('Invalid reaction role panel payload');
    guild.panels[id] = stored;
    persist();
    return { ...stored, options: stored.options.slice() };
}

function getPanel(guildId, panelId) {
    const guild = ensureGuild(guildId);
    const panel = guild.panels[String(panelId)];
    const cleaned = sanitisePanel(panel);
    return cleaned ? { ...cleaned, options: cleaned.options.slice() } : null;
}

function removePanel(guildId, panelId) {
    const guild = ensureGuild(guildId);
    const key = String(panelId);
    if (!guild.panels[key]) return false;
    delete guild.panels[key];
    persist();
    return true;
}

function setPanelMessage(guildId, panelId, channelId, messageId) {
    const guild = ensureGuild(guildId);
    const key = String(panelId);
    const panel = guild.panels[key];
    if (!panel) return null;
    panel.channelId = channelId ? String(channelId) : panel.channelId;
    panel.messageId = messageId ? String(messageId) : panel.messageId;
    guild.panels[key] = sanitisePanel(panel) || panel;
    persist();
    return getPanel(guildId, panelId);
}

module.exports = {
    createPanel,
    getPanel,
    removePanel,
    setPanelMessage,
};

