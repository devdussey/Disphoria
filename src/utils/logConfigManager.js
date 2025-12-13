const { ChannelType, PermissionsBitField } = require('discord.js');
const logChannelTypeStore = require('./logChannelTypeStore');

const LOG_CATEGORY_NAME = 'Logs';
const LOG_CHANNEL_LABELS = {
  moderation: 'Moderation',
  security: 'Security',
  message: 'Message',
  member: 'Member',
  role: 'Role',
  channel: 'Channel',
  server: 'Server',
  verification: 'Verification',
  invite: 'Invite',
  voice: 'Voice',
  emoji: 'Emoji & Stickers',
  integration: 'Integrations & Webhooks',
  automod: 'AutoMod',
  command: 'Commands',
  system: 'System',
};

const VALID_LOG_TYPES = Object.values(logChannelTypeStore.LOG_TYPES);

function isValidLogType(logType) {
  return VALID_LOG_TYPES.includes(logType);
}

function getFriendlyName(logType) {
  if (typeof logType !== 'string') return logType;
  return LOG_CHANNEL_LABELS[logType] ?? logType;
}

async function ensureLogCategory(guild) {
  if (!guild) return null;
  const existing = guild.channels.cache.find(ch =>
    ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === LOG_CATEGORY_NAME.toLowerCase()
  );
  if (existing) return existing;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ManageChannels)) return null;

  try {
    const created = await guild.channels.create({
      name: LOG_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
    });
    return created;
  } catch (err) {
    console.error('Failed to create log category:', err);
    return null;
  }
}

async function ensureDefaultChannelForType(guild, logType) {
  if (!guild || !isValidLogType(logType)) return null;
  const channelName = `logs-${logType}`;
  const friendly = getFriendlyName(logType);

  const existing = guild.channels.cache.find(ch =>
    ch.name === channelName && ch.type === ChannelType.GuildText
  );
  if (existing) return existing;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ManageChannels)) return null;

  const category = await ensureLogCategory(guild);

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Logs ${friendly} events.`,
      parent: category?.id || undefined,
    });
    return channel;
  } catch (err) {
    console.error(`Failed to create default channel for ${logType}:`, err);
    return null;
  }
}

async function ensureAllDefaultChannels(guild) {
  const created = [];
  if (!guild) return created;
  const guildId = guild.id;
  if (!guildId) return created;

  for (const logType of VALID_LOG_TYPES) {
    const entry = await logChannelTypeStore.getEntry(guildId, logType);
    let needsCreation = !entry?.channelId;
    if (!needsCreation && entry.channelId) {
      const existing = await guild.channels.fetch(entry.channelId).catch(() => null);
      if (!existing) needsCreation = true;
    }

    if (!needsCreation) continue;

    const channel = await ensureDefaultChannelForType(guild, logType);
    if (!channel) continue;

    await logChannelTypeStore.setChannel(guildId, logType, channel.id);
    created.push(logType);
  }

  return created;
}

module.exports = {
  LOG_CATEGORY_NAME,
  LOG_CHANNEL_LABELS,
  ensureLogCategory,
  ensureDefaultChannelForType,
  ensureAllDefaultChannels,
  getFriendlyName,
};
