const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const sentenceRushGameManager = require('../utils/sentenceRushGameManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sentancerush')
    .setDescription('Play SentenceRush: guess the hidden sentence (turn-based).')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Start a SentenceRush lobby in this channel (30s join button)')),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command in a server channel.', ephemeral: true });
    }

    const channel = interaction.channel;
    if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
      return interaction.reply({ content: 'SentenceRush can only run in text-based channels.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== 'start') {
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    }

    const mePermissions = channel.permissionsFor(interaction.client.user);
    if (!mePermissions?.has(PermissionsBitField.Flags.SendMessages)) {
      return interaction.reply({ content: 'I need permission to send messages in this channel to host SentenceRush.', ephemeral: true });
    }
    if (!mePermissions?.has(PermissionsBitField.Flags.EmbedLinks)) {
      return interaction.reply({ content: 'I need the Embed Links permission in this channel to host SentenceRush.', ephemeral: true });
    }

    const result = await sentenceRushGameManager.startSentenceRushGame(interaction);
    if (!result.ok) {
      return interaction.reply({ content: result.error || 'Unable to start SentenceRush right now.', ephemeral: true });
    }

    return interaction.reply({
      content: `SentenceRush lobby started in ${channel}. Click **Join SentenceRush** in chat (30s). Turn timer: **20s**.`,
      ephemeral: true,
    });
  },
};
