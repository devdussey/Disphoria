const { Events } = require('discord.js');
const logSender = require('../utils/logSender');
const { buildLogEmbed } = require('../utils/logEmbedFactory');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message.guild || message.author?.bot) return;
      const content = message.content?.substring(0, 1000) || '*No content*';
      const embed = buildLogEmbed({
        action: 'Message Created',
        target: message.author,
        actor: message.author,
        reason: content,
        color: 0x5865f2,
        extraFields: [
          { name: 'Channel', value: `<#${message.channel.id}> (${message.channel.id})`, inline: true },
          { name: 'Message ID', value: message.id, inline: true },
          { name: 'Attachments', value: message.attachments.size > 0 ? `${message.attachments.size} file(s)` : 'None', inline: true },
        ],
      });
      await logSender.sendLog({
        guildId: message.guild.id,
        logType: 'message',
        embed,
        client: message.client,
      });
    } catch (err) {
      console.error('messageLog.MessageCreate error:', err);
    }
  },
};
