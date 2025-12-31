const { Events, PermissionsBitField } = require('discord.js');
const boosterConfigStore = require('../utils/boosterRoleConfigStore');
const { postBoosterRolePanel } = require('../utils/boosterRolePanel');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message.guild) return;
      if (message.author?.bot) return;

      const panel = await boosterConfigStore.getPanel(message.guild.id);
      if (!panel?.channelId || panel.channelId !== message.channel.id) return;

      let me = message.guild.members.me;
      if (!me) {
        try { me = await message.guild.members.fetchMe(); } catch (_) { return; }
      }
      const perms = message.channel.permissionsFor(me);
      if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) return;
      if (!perms?.has(PermissionsBitField.Flags.SendMessages)) return;

      const sent = await postBoosterRolePanel(message.channel, panel.messageId);
      await boosterConfigStore.setPanel(message.guild.id, message.channel.id, sent.id);
    } catch (err) {
      console.warn('Failed to refresh booster role panel sticky message:', err);
    }
  },
};
