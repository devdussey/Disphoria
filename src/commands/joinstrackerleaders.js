const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const joinLeaveStore = require('../utils/joinLeaveStore');
const { applyDefaultColour } = require('../utils/guildColourStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('joinstrackerleaders')
    .setDescription('Show members who have joined the server the most times')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
    }

    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Manage Server permission is required to view join tracker leaders.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const leaderboard = joinLeaveStore.getLeaderboard(interaction.guildId, 'join', null, 10);
    if (!leaderboard.length) {
      return interaction.editReply({ content: 'No join activity has been recorded yet.', ephemeral: true });
    }

    const lines = [];
    for (let i = 0; i < leaderboard.length; i += 1) {
      const entry = leaderboard[i];
      const rank = i + 1;
      let label = `<@${entry.userId}>`;
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        if (user?.tag) label = `${user.tag} (<@${entry.userId}>)`;
      } catch (_) {}
      lines.push(`**${rank}.** ${label} — ${entry.joins} join${entry.joins === 1 ? '' : 's'}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('Join Tracker Leaders')
      .setDescription(lines.join('\n'));
    try { applyDefaultColour(embed, interaction.guildId); } catch (_) {}

    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
