const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const logChannelTypeStore = require('../utils/logChannelTypeStore');
const logSender = require('../utils/logSender');
const { buildLogEmbed } = require('../utils/logEmbedFactory');

const LOG_KEY = 'invite';
const TEST_COLOR = 0x3498db;

function formatStatus(enabled) {
  return enabled ? 'enabled' : 'disabled';
}

function buildTestEmbed(channelId, requester) {
  return buildLogEmbed({
    action: 'Invite Log Test',
    target: requester || 'System',
    actor: requester || 'System',
    reason: 'Testing invite log routing',
    color: TEST_COLOR,
    extraFields: [
      { name: 'Route', value: 'invite_create → invite', inline: true },
      { name: 'Channel', value: channelId ? `<#${channelId}>` : 'No channel set', inline: true },
      { name: 'Note', value: 'If you can see this in the log channel, invite logs are wired correctly.', inline: false },
    ],
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invitelogconfig')
    .setDescription('Configure invite log routing')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('Enable or disable invite logs')
        .setRequired(true)
        .addChoices(
          { name: 'enable', value: 'enable' },
          { name: 'disable', value: 'disable' },
          { name: 'test send', value: 'test' },
        ))
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where invite logs should be posted')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command inside a server.', ephemeral: true });
    }

    if (!interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Manage Server permission is required to configure invite logs.', ephemeral: true });
    }

    const status = interaction.options.getString('status', true);
    const channel = interaction.options.getChannel('channel', false);
    const isTest = status === 'test';
    const enable = status === 'enable' || isTest;

    let existingEntry = null;
    try {
      existingEntry = await logChannelTypeStore.getEntry(interaction.guildId, LOG_KEY);
    } catch (err) {
      console.error('Failed to read invite log config:', err);
    }

    if (enable && !channel && !existingEntry?.channelId) {
      return interaction.reply({
        content: `Please select a channel to ${isTest ? 'test' : 'enable'} invite logs.`,
        ephemeral: true,
      });
    }

    if (channel) {
      const isForum = channel.type === ChannelType.GuildForum;
      if (!channel.isTextBased?.() && !isForum) {
        return interaction.reply({ content: 'Please choose a text-based or forum channel.', ephemeral: true });
      }
      const me = interaction.guild?.members?.me || await interaction.guild?.members?.fetchMe().catch(() => null);
      if (me) {
        const required = [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.EmbedLinks,
        ];
        if (isForum) {
          required.push(
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.SendMessagesInThreads,
          );
        } else if (typeof channel.isThread === 'function' ? channel.isThread() : Boolean(channel.isThread)) {
          required.push(PermissionsBitField.Flags.SendMessagesInThreads);
        } else {
          required.push(PermissionsBitField.Flags.SendMessages);
        }
        const perms = channel.permissionsFor(me);
        if (!perms || !perms.has(required)) {
          const missing = required
            .filter(flag => !perms?.has(flag))
            .map(flag => Object.entries(PermissionsBitField.Flags).find(([, v]) => v === flag)?.[0] || String(flag));
          const missingList = missing.length ? missing.join(', ') : 'required permissions';
          return interaction.reply({
            content: `I need ${missingList} permissions in ${channel} to post invite logs.`,
            ephemeral: true,
          });
        }
      }
    }

    try {
      if (channel) {
        await logChannelTypeStore.setChannel(interaction.guildId, LOG_KEY, channel.id);
      }
      if (enable) {
        await logChannelTypeStore.setEnabled(interaction.guildId, LOG_KEY, true);
      } else if (status === 'disable') {
        await logChannelTypeStore.setEnabled(interaction.guildId, LOG_KEY, false);
      }
    } catch (err) {
      console.error('Failed to update invite log config:', err);
      return interaction.reply({ content: 'Failed to update invite log configuration.', ephemeral: true });
    }

    const targetChannelId = channel?.id || existingEntry?.channelId;
    const channelText = targetChannelId ? `<#${targetChannelId}>` : 'No channel set';

    let testMessage = '';
    if (isTest) {
      const testEmbed = buildTestEmbed(targetChannelId, interaction.user);
      let ok = false;
      try {
        ok = await logSender.sendLog({
          guildId: interaction.guildId,
          logType: 'invite_create',
          embed: testEmbed,
          client: interaction.client,
        });
      } catch (err) {
        console.error('Failed to send invite log test:', err);
      }
      testMessage = ok
        ? '\nTest log: ✅ delivered. Check the configured channel.'
        : '\nTest log: ❌ could not be delivered. Please check channel permissions and routing.';
    }

    return interaction.reply({
      content: `Invite logs are now **${formatStatus(enable)}**. Channel: ${channelText}.${testMessage}`,
      ephemeral: true,
    });
  },
};
