const { Events } = require('discord.js');
const messageLogStore = require('../utils/userMessageLogStore');
const rupeeStore = require('../utils/rupeeStore');
const smiteConfigStore = require('../utils/smiteConfigStore');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message?.guild) return;
    if (message.author?.bot) return;

    try {
      await messageLogStore.recordMessage(message.guild.id, message.author.id, message);
    } catch (err) {
      console.error('Failed to update rupee message log', err);
    }

    if (!smiteConfigStore.isEnabled(message.guild.id)) return;

    try {
      const result = await rupeeStore.incrementMessage(message.guild.id, message.author.id);
      if (!result?.awarded || result.awarded <= 0) return;

      const newBalance = Number.isFinite(result.tokens) ? result.tokens : rupeeStore.getBalance(message.guild.id, message.author.id);
      const earnedText = result.awarded === 1 ? 'a rupee' : `${result.awarded} rupees`;
      try {
        await message.channel?.send({ content: `<@${message.author.id}> earned ${earnedText}, they now have ${newBalance}.` });
      } catch (_) {}
    } catch (err) {
      console.error('Failed to award rupees', err);
    }
  },
};
