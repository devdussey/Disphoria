const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { buildLogConfigView } = require('../utils/logConfigView');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logconfig')
    .setDescription('Configure where each log event is sent'),

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
      const view = await buildLogConfigView(guild, null, {
        category: 'Message',
        note: 'Tip: set broad “All … Events” routes first, then override specific events.',
      });
      await interaction.editReply({ embeds: [view.embed], components: view.components });
    } catch (err) {
      console.error('Failed to build logging configuration view:', err);
      await interaction.editReply({ content: 'Failed to open the logging configuration. Please try again later.' });
    }
  },
};
