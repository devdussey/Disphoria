const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ComponentType } = require('discord.js');
const automodConfigStore = require('../utils/automodConfigStore');
const { resolveEmbedColour } = require('../utils/guildColourStore');

const VOTES_REQUIRED = 5;
const VOTE_WINDOW_MS = 2 * 60_000;
const MUTE_DURATION_MS = 10 * 60_000;

function normalizeContent(message) {
  return (message?.content || '').toLowerCase();
}

function findFlaggedTerm(content, terms) {
  const lower = content.toLowerCase();
  return terms.find(term => lower.includes(term.toLowerCase()));
}

function formatSnippet(content) {
  if (!content) return '_No content_';
  const trimmed = content.length > 300 ? `${content.slice(0, 297)}...` : content;
  return trimmed;
}

async function sendLog({ guild, logChannelId, embed }) {
  if (!logChannelId) return;
  try {
    const channel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Automod log send failed:', err);
  }
}

function buildVoteRow(muteVotes, kickVotes, resolved, baseId) {
  const muteLabel = `Mute (${muteVotes}/${VOTES_REQUIRED})`;
  const kickLabel = `Kick (${kickVotes}/${VOTES_REQUIRED})`;
  const disabled = resolved;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:mute`)
      .setLabel(muteLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${baseId}:kick`)
      .setLabel(kickLabel)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message?.guild) return;
      if (message.author?.bot) return;

      const guildId = message.guild.id;
      const config = automodConfigStore.getConfig(guildId);
      if (!config.enabled) return;
      const flagTerms = Array.isArray(config.flags) ? config.flags : [];
      if (!flagTerms.length) return;

      const content = normalizeContent(message);
      const matchedTerm = findFlaggedTerm(content, flagTerms);
      if (!matchedTerm) return;

      const color = resolveEmbedColour(guildId, 0xedc531);

      const publicEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle('Automod Flag')
        .setDescription(`${message.author} has been flagged for the following content:`)
        .addFields({ name: 'Message', value: formatSnippet(message.content) || '_No content_' })
        .setFooter({ text: '5 votes for Mute or Kick will take action. If no action in 2 minutes, this vote will close.' })
        .setTimestamp(new Date());

      const logEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle('Automod Flag Logged')
        .addFields(
          { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
          { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
          { name: 'Matched term', value: matchedTerm || 'N/A', inline: true },
          { name: 'Content', value: formatSnippet(message.content) || '_No content_', inline: false },
        )
        .setTimestamp(new Date());

      await sendLog({ guild: message.guild, logChannelId: config.logChannelId, embed: logEmbed });

      let muteVotes = 0;
      let kickVotes = 0;
      let resolved = false;

      const baseId = `automod-vote-${message.id}-${Date.now()}`;
      const row = buildVoteRow(muteVotes, kickVotes, resolved, baseId);

      const voteMessage = await message.channel.send({
        embeds: [publicEmbed],
        components: [row],
        allowedMentions: { users: [] },
      });

      const collector = voteMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: VOTE_WINDOW_MS,
      });

      const votersMute = new Set();
      const votersKick = new Set();

      const updateMessage = async () => {
        const updatedRow = buildVoteRow(muteVotes, kickVotes, resolved, baseId);
        try {
          await voteMessage.edit({ components: [updatedRow] });
        } catch (_) {}
      };

      const endWithResolution = async (actionTaken, errorMessage) => {
        resolved = true;
        const updatedEmbed = EmbedBuilder.from(publicEmbed);
        if (actionTaken) {
          updatedEmbed.setColor(0x57f287).setTitle(`Action taken: ${actionTaken}`);
        } else if (errorMessage) {
          updatedEmbed.setColor(0xed4245).setTitle('Action failed').setDescription(errorMessage);
        } else {
          updatedEmbed.setTitle('Voting closed').setColor(color);
        }
        try {
          await voteMessage.edit({
            embeds: [updatedEmbed],
            components: [buildVoteRow(muteVotes, kickVotes, true, baseId)],
          });
        } catch (_) {}
      };

      collector.on('collect', async (i) => {
        if (resolved) return;
        if (i.user.bot) return;
        if (i.customId.startsWith(baseId)) {
          const [, action] = i.customId.split(':');
          if (action === 'mute') {
            if (votersMute.has(i.user.id)) {
              await i.reply({ content: 'You already voted to mute.', ephemeral: true });
              return;
            }
            votersMute.add(i.user.id);
            muteVotes = votersMute.size;
          } else if (action === 'kick') {
            if (votersKick.has(i.user.id)) {
              await i.reply({ content: 'You already voted to kick.', ephemeral: true });
              return;
            }
            votersKick.add(i.user.id);
            kickVotes = votersKick.size;
          }
          await i.deferUpdate();
          await updateMessage();

          if (muteVotes >= VOTES_REQUIRED && !resolved) {
            resolved = true;
            const me = message.guild.members.me;
            const canMute = me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers);
            if (!canMute) {
              await endWithResolution(null, 'Cannot mute: missing Moderate Members permission.');
              collector.stop('resolved');
              return;
            }
            const targetMember = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (!targetMember || targetMember.id === me.id) {
              await endWithResolution(null, 'Cannot mute target.');
              collector.stop('resolved');
              return;
            }
            const higher = me.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
            if (!higher || !targetMember.moderatable) {
              await endWithResolution(null, 'Cannot mute due to role hierarchy or permissions.');
              collector.stop('resolved');
              return;
            }
            try {
              await targetMember.timeout(MUTE_DURATION_MS, 'Automod community vote');
              await endWithResolution('Mute (timeout applied)', null);
            } catch (err) {
              await endWithResolution(null, 'Failed to mute the user.');
            }
            collector.stop('resolved');
          } else if (kickVotes >= VOTES_REQUIRED && !resolved) {
            resolved = true;
            const me = message.guild.members.me;
            const canKick = me?.permissions?.has(PermissionsBitField.Flags.KickMembers);
            if (!canKick) {
              await endWithResolution(null, 'Cannot kick: missing Kick Members permission.');
              collector.stop('resolved');
              return;
            }
            const targetMember = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (!targetMember || targetMember.id === me.id) {
              await endWithResolution(null, 'Cannot kick target.');
              collector.stop('resolved');
              return;
            }
            const higher = me.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
            if (!higher || !targetMember.kickable) {
              await endWithResolution(null, 'Cannot kick due to role hierarchy or permissions.');
              collector.stop('resolved');
              return;
            }
            try {
              await targetMember.kick('Automod community vote');
              await endWithResolution('Kick', null);
            } catch (err) {
              await endWithResolution(null, 'Failed to kick the user.');
            }
            collector.stop('resolved');
          }
        }
      });

      collector.on('end', async () => {
        if (!resolved) {
          try { await voteMessage.delete(); } catch (_) {}
        }
      });
    } catch (err) {
      console.error('Automod message handler error:', err);
    }
  },
};
