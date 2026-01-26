const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require('discord.js');
const rupeeStore = require('../utils/rupeeStore');
const { resolveEmbedColour } = require('../utils/guildColourStore');

function buildEmbed(guildId, entries, page) {
  const embed = new EmbedBuilder()
    .setColor(resolveEmbedColour(guildId, 0x00f0ff))
    .setTitle('Rupee Balances')
    .setDescription(`Users with rupees: **${entries.length}**`);

  const start = page * 20;
  const slice = entries.slice(start, start + 20);
  const lines = slice.map((entry, idx) => {
    const rank = start + idx + 1;
    return `${rank}. <@${entry.userId}> — **${entry.tokens}** rupee${entry.tokens === 1 ? '' : 's'}`;
  });

  embed.addFields({
    name: 'Leaderboard',
    value: lines.length ? lines.join('\n') : '_No rupees yet._',
  });

  return embed;
}

function buildPagerComponents(total) {
  if (total <= 20) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('viewrupees:prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('viewrupees:next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(true),
  );
  return [row];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewrupees')
    .setDescription('View rupee balances for this server')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this in a server.', ephemeral: true });
    }

    const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
    if (!isAdmin) {
      return interaction.reply({ content: 'Only server administrators can use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const entries = rupeeStore.listUserBalances(interaction.guildId, { minTokens: 1 });
    const embed = buildEmbed(interaction.guildId, entries, 0);
    const components = buildPagerComponents(entries.length);

    await interaction.editReply({
      embeds: [embed],
      components,
    });
  },
};
