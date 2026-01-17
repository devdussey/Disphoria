const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
} = require('discord.js');
const { resolveEmbedColour } = require('../utils/guildColourStore');
const automodConfigStore = require('../utils/automodConfigStore');

function parseFlags(raw) {
  if (!raw) return null;
  const parts = raw
    .split(/[\n,]+/g)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [];
}

function makeEmbed(guildId, config) {
  return new EmbedBuilder()
    .setColor(resolveEmbedColour(guildId, 0x5865f2))
    .setTitle('AI Automod Configuration')
    .setDescription('Flag messages using AI + keyword filters. Votes decide the action (Mute or Kick).')
    .addFields(
      { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      {
        name: 'Log channel',
        value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Flag terms',
        value: config.flags.length ? config.flags.map(f => `• ${f}`).join('\n').slice(0, 1024) : '_No terms set._',
        inline: false,
      },
      {
        name: 'How it works',
        value: 'Flagged messages are announced publicly with **Mute** and **Kick** buttons. Any option reaching 5 votes executes. If no action after 2 minutes, the vote message is deleted (logs are kept).',
        inline: false,
      },
    );
}

function buildToggleRow(enabled, baseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:${enabled ? 'disable' : 'enable'}`)
      .setLabel(enabled ? 'Disable Automod' : 'Enable Automod')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automodconfig')
    .setDescription('Configure the AI automod settings')
    .addChannelOption(opt =>
      opt
        .setName('log_channel')
        .setDescription('Channel to log flagged messages')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption(opt =>
      opt
        .setName('flag_terms')
        .setDescription('Comma or newline separated list of words/phrases to flag'),
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this in a server.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const logChannel = interaction.options.getChannel('log_channel');
    const flagsRaw = interaction.options.getString('flag_terms');

    const updates = {};
    if (logChannel) {
      updates.logChannelId = logChannel.id;
    }
    const parsedFlags = parseFlags(flagsRaw);
    if (parsedFlags) {
      updates.flags = parsedFlags;
    }

    let config = automodConfigStore.getConfig(guildId);
    if (Object.keys(updates).length) {
      config = await automodConfigStore.updateConfig(guildId, updates);
    }

    const embed = makeEmbed(guildId, config);
    const baseId = `automod-toggle-${interaction.id}`;
    const row = buildToggleRow(config.enabled, baseId);

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 2 * 60_000,
    });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: 'Only the admin who opened this panel can toggle it.', ephemeral: true });
        return;
      }
      const action = btn.customId.split(':')[1];
      const nextEnabled = action === 'enable';
      config = await automodConfigStore.updateConfig(guildId, { enabled: nextEnabled });
      const updatedEmbed = makeEmbed(guildId, config);
      const updatedRow = buildToggleRow(config.enabled, baseId);
      await btn.update({ embeds: [updatedEmbed], components: [updatedRow] });
    });

    collector.on('end', async () => {
      try {
        const disabledRow = buildToggleRow(config.enabled, baseId);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.editReply({ components: [disabledRow] });
      } catch (_) {}
    });
  },
};
