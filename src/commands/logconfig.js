const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const logChannelTypeStore = require('../utils/logChannelTypeStore');
const logConfigManager = require('../utils/logConfigManager');
const { buildLogConfigView } = require('../utils/logConfigView');

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
    if (!guild) {
      return interaction.editReply({ content: 'Could not resolve this server. Please try again.' });
    }

    try {
      const created = await logConfigManager.ensureAllDefaultChannels(guild);
      const logTypes = Object.values(logChannelTypeStore.LOG_TYPES);
      const defaultType = created[0] || logTypes[0];
      const note = created.length
        ? `Created default log channel${created.length === 1 ? '' : 's'} for ${created.map(t => logConfigManager.getFriendlyName(t)).join(', ')}.`
        : 'All logging categories already have a channel configured.';
      const view = await buildLogConfigView(guild, defaultType, { note });
      await interaction.editReply({ embeds: [view.embed], components: view.components });
    } catch (err) {
      console.error('Failed to build logging configuration view:', err);
      await interaction.editReply({ content: 'Failed to open the logging configuration. Please try again later.' });
    }
  },
};
