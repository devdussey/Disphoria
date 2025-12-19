const { Events, AuditLogEvent, PermissionsBitField, EmbedBuilder } = require('discord.js');
const logSender = require('../utils/logSender');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      const guild = member.guild;
      const client = member.client;
      // Determine if kicked/banned via audit logs (best-effort)
      let reason = 'left';
      const me = guild.members.me;
      if (me && me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
        try {
          const logs = await guild.fetchAuditLogs({ limit: 5 });
          const recent = logs.entries.filter(e => (Date.now() - e.createdTimestamp) < 10_000);
          const kick = recent.find(e => e.action === AuditLogEvent.MemberKick && e.target?.id === member.id);
          const ban = recent.find(e => e.action === AuditLogEvent.MemberBanAdd && e.target?.id === member.id);
          if (kick) reason = 'kick';
          if (ban) reason = 'ban';
        } catch (_) { /* ignore */ }
      }
      // Bans are handled by the GuildBanAdd event to avoid duplicates.
      if (reason === 'ban') return;

      // Log the member removal
      const logEmbed = new EmbedBuilder()
        .setTitle(`👋 Member ${reason === 'ban' ? 'Banned' : reason === 'kick' ? 'Kicked' : 'Left'}`)
        .setColor(reason === 'left' ? 0xffa500 : 0xff0000)
        .addFields(
          { name: 'User', value: `${member.user?.tag || member.user?.username || member.id} (${member.id})`, inline: false },
          { name: 'Reason', value: reason, inline: true },
          { name: 'Guild', value: `${guild.name} (${guild.id})`, inline: false }
        )
        .setTimestamp();

      await logSender.sendLog({
        guildId: guild.id,
        logType: reason === 'kick' ? 'member_kick' : 'member_leave',
        embed: logEmbed,
        client,
      });
    } catch (e) {
      // swallow
    }
  },
};
