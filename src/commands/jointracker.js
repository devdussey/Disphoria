const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require('discord.js');
const joinTrackerStore = require('../utils/joinTrackerStore');
const { buildJoinEmbed } = require('../utils/joinTrackerEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jointracker')
    .setDescription('Configure join tracking embeds for new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('config')
        .setDescription('Enable join tracking and pick a channel for the embeds')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to post join tracker embeds')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show the current join tracker configuration')
    )
    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('Disable join tracking without clearing saved settings')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
    }

    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Manage Server permission is required to configure join tracking.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'config') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased?.()) {
        return interaction.reply({ content: 'Pick a text channel where I can post embeds.', ephemeral: true });
      }

      const me = interaction.guild.members.me;
      const perms = channel.permissionsFor(me);
      if (!perms?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
        return interaction.reply({
          content: 'I need Send Messages and Embed Links permissions in that channel.',
          ephemeral: true,
        });
      }

      await joinTrackerStore.setConfig(interaction.guildId, channel.id, {
        updatedBy: { id: interaction.user.id, tag: interaction.user.tag },
      });

      // Post a preview so staff can see the embed layout
      try {
        const preview = buildJoinEmbed(interaction.member, {
          joinedAt: new Date(),
          joinCount: 1,
          sourceText: 'Preview: used vanity server link or specific invite link will appear here.',
        });
        await channel.send({
          content: 'Join tracker configured. Future joins will appear like this:',
          embeds: [preview],
        });
      } catch (err) {
        console.error('Failed to send join tracker preview:', err);
      }

      return interaction.reply({
        content: `Join tracker enabled in ${channel}. I will post a detailed embed each time someone joins.`,
        ephemeral: true,
      });
    }

    if (sub === 'status') {
      const cfg = joinTrackerStore.getConfig(interaction.guildId);
      if (!cfg || !cfg.channelId) {
        return interaction.reply({ content: 'Join tracker is not configured.', ephemeral: true });
      }
      const status = cfg.enabled !== false ? 'Enabled' : 'Disabled';
      const updated = cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleString() : 'Unknown';
      const updatedBy = cfg.updatedBy?.tag || cfg.updatedBy?.id || 'Unknown';
      return interaction.reply({
        content: [
          `Status: **${status}**`,
          `Channel: <#${cfg.channelId}>`,
          `Last updated: ${updated} by ${updatedBy}`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (sub === 'disable') {
      const cfg = await joinTrackerStore.disable(interaction.guildId);
      if (!cfg || !cfg.channelId) {
        return interaction.reply({ content: 'Join tracker was not configured.', ephemeral: true });
      }
      return interaction.reply({ content: 'Join tracker disabled. Re-run config to enable it again.', ephemeral: true });
    }

    return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  },
};
