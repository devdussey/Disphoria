const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const logChannelTypeStore = require('../utils/logChannelTypeStore');

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
};

const LOG_TYPES = Object.values(logChannelTypeStore.LOG_TYPES);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logconfig')
    .setDescription('Ensure each tracked event has its own log channel'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command inside a server.', ephemeral: true });
    }

    const member = interaction.member;
    if (!member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Manage Server permission is required to configure logging.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const guildId = interaction.guildId;
    const categoryName = 'Logs';
    let logCategory = guild.channels.cache.find(ch =>
      ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!logCategory) {
      logCategory = await guild.channels
        .create({ name: categoryName, type: ChannelType.GuildCategory })
        .catch((err) => {
          console.error('Failed to create log category:', err);
          return null;
        });
    }

    const created = [];
    const existing = [];
    const failed = [];

    for (const logType of LOG_TYPES) {
      const friendly = LOG_CHANNEL_LABELS[logType] ?? logType;
      let channel = guild.channels.cache.find(ch =>
        ch.name === `logs-${logType}` && ch.type === ChannelType.GuildText
      );

      let action = 'linked';
      if (!channel) {
        try {
          channel = await guild.channels.create({
            name: `logs-${logType}`,
            type: ChannelType.GuildText,
            topic: `Logs ${friendly} events.`,
            parent: logCategory?.id || undefined,
          });
          action = 'created';
          created.push(`<#${channel.id}> \`${friendly}\``);
        } catch (err) {
          console.error(`Failed to create channel for ${logType}:`, err);
          failed.push(friendly);
          continue;
        }
      } else {
        if (logCategory && channel.parentId !== logCategory.id) {
          try {
            await channel.setParent(logCategory.id);
          } catch (err) {
            console.error(`Failed to move ${channel.id} into ${logCategory.id}:`, err);
          }
        }
        existing.push(`<#${channel.id}> \`${friendly}\``);
      }

      try {
        await logChannelTypeStore.setChannel(guildId, logType, channel.id);
      } catch (err) {
        console.error(`Failed to save ${logType} channel id:`, err);
        failed.push(friendly);
        continue;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Logging Channels Synced')
      .setDescription('Each tracked event now has its own dedicated channel, and the bot will remember them for future logs.')
      .setColor(0x5865f2)
      .addFields(
        { name: 'New channels created', value: created.length ? created.join('\n') : 'None' },
        { name: 'Already existed', value: existing.length ? existing.join('\n') : 'None' },
        { name: 'Failures', value: failed.length ? failed.join(', ') : 'None' }
      );

    try {
      const { applyDefaultColour } = require('../utils/guildColourStore');
      applyDefaultColour(embed, guildId);
    } catch (_) {}

    await interaction.editReply({ embeds: [embed] });
  },
};
