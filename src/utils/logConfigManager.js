const { ChannelType, PermissionsBitField } = require('discord.js');
const { getLogKeyLabel, isValidLogKey } = require('./logEvents');

const LOG_CATEGORY_NAME = 'Logs';
function isValidLogType(logType) {
  return isValidLogKey(logType);
}

function getFriendlyName(logType) {
  return getLogKeyLabel(logType);
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
  const safeName = String(logType).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const channelName = `logs-${safeName}`.slice(0, 96);
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

module.exports = {
  LOG_CATEGORY_NAME,
  ensureLogCategory,
  ensureDefaultChannelForType,
  getFriendlyName,
};
