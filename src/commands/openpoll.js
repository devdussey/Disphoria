const { SlashCommandBuilder } = require('discord.js');
const openPollStore = require('../utils/openPollStore');
const openPollManager = require('../utils/openPollManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openpoll')
    .setDescription('Create an open poll where users can add answers')
    .addStringOption(opt =>
      opt
        .setName('question')
        .setDescription('The poll question')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const question = (interaction.options.getString('question', true) || '').trim();
    if (!question) {
      await interaction.reply({ content: 'Please provide a poll question.', ephemeral: true });
      return;
    }

    let poll = null;
    try {
      poll = openPollStore.createPoll(interaction.guildId, {
        creatorId: interaction.user.id,
        channelId: interaction.channelId,
        question,
        open: true,
      });
    } catch (err) {
      console.error('Failed to create open poll:', err);
      await interaction.reply({ content: 'Failed to create the poll. Please try again.', ephemeral: true });
      return;
    }

    try {
      const message = await interaction.reply({
        ...openPollManager.buildPollView(poll, interaction.guildId),
        fetchReply: true,
      });
      openPollStore.setPollMessage(interaction.guildId, poll.id, interaction.channelId, message.id);
    } catch (err) {
      openPollStore.removePoll(interaction.guildId, poll?.id);
      throw err;
    }
  },
};

