const { Events, AuditLogEvent, PermissionsBitField } = require('discord.js');
const logSender = require('../utils/logSender');
const { buildLogEmbed } = require('../utils/logEmbedFactory');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    try {
      if (!message?.guild || !message.channel) return;
      const guild = message.guild;
      const me = guild.members.me;
      if (!me) return;
      let executor = null;
      if (me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
        try {
          const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
          const entry = logs.entries.find(e => e.target?.id === message.author?.id && (Date.now() - e.createdTimestamp) < 10_000);
          if (entry) executor = entry.executor || null;
        } catch (_) {}
      }
      const content = message.content ? (message.content.length > 1024 ? message.content.slice(0, 1021) + '...' : message.content) : '*No content available*';
      const embed = buildLogEmbed({
        action: 'Message Deleted',
        target: message.author || 'Unknown',
        actor: executor || 'System',
        reason: content,
        color: 0xed4245,
        extraFields: [
          { name: 'Channel', value: `<#${message.channel.id}> (${message.channel.id})`, inline: true },
          { name: 'Message ID', value: message.id || 'Unknown', inline: true },
          { name: 'Deleted by', value: executor ? `${executor.tag} (${executor.id})` : 'Unknown', inline: true },
        ],
      });
      await logSender.sendLog({
        guildId: guild.id,
        logType: 'message_delete',
        embed,
        client: message.client,
        ownerFallback: true,
      });
    } catch (err) {
      console.error('messageDelete handler error:', err);
    }
  },
};
