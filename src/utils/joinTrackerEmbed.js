const { EmbedBuilder } = require('discord.js');
const { applyDefaultColour } = require('./guildColourStore');

function formatJoinTime(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const time = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  return `Joined on ${time} at ${dateStr}`;
}

function formatInviteSource({ usedInvite = null, vanityInfo = null, fallback = null } = {}) {
  if (usedInvite) {
    const base = usedInvite.code ? `discord.gg/${usedInvite.code}` : 'an invite link';
    const channelHint = usedInvite.channelId ? ` in <#${usedInvite.channelId}>` : '';
    const creator = usedInvite.inviterTag
      ? usedInvite.inviterTag
      : usedInvite.inviterId
        ? `User ID ${usedInvite.inviterId}`
        : 'an unknown creator';
    return `Joined from *${base}*${channelHint} created by ${creator}`;
  }

  if (vanityInfo?.used) {
    const code = vanityInfo.code ? `discord.gg/${vanityInfo.code}` : 'the server vanity link';
    return `Used vanity server link (${code})`;
  }

  if (vanityInfo?.hasVanity) {
    const code = vanityInfo.code ? `discord.gg/${vanityInfo.code}` : 'vanity link';
    return `Vanity link available (${code}); exact invite unknown`;
  }

  return fallback || 'Invite source unknown (vanity URL or expired/unknown invite)';
}

function buildJoinEmbed(member, { joinedAt = new Date(), joinCount = 1, sourceText = null } = {}) {
  const user = member?.user || member;
  const displayName = member?.displayName || user?.globalName || user?.username || 'Unknown';
  const username = user?.tag || user?.username || 'Unknown user';
  const userId = user?.id || 'Unknown ID';
  const thumbUrl = member?.displayAvatarURL?.({ dynamic: true })
    || user?.displayAvatarURL?.({ dynamic: true })
    || null;

  const embed = new EmbedBuilder()
    .setTitle('Member Joined')
    .setDescription(formatJoinTime(joinedAt))
    .addFields(
      {
        name: 'Member',
        value: `Display Name: ${displayName}\nUsername: ${username}\nUser ID: ${userId}`,
        inline: false,
      },
      {
        name: 'Invite',
        value: sourceText || 'Invite source unknown (vanity URL or expired/unknown invite)',
        inline: false,
      },
      {
        name: 'Joins Recorded',
        value: `${Number.isFinite(joinCount) ? joinCount : 0}`,
        inline: true,
      },
    )
    .setTimestamp(joinedAt);

  try { applyDefaultColour(embed, member?.guild?.id); } catch (_) {}
  if (thumbUrl) embed.setThumbnail(thumbUrl);
  return embed;
}

module.exports = {
  buildJoinEmbed,
  formatJoinTime,
  formatInviteSource,
};
