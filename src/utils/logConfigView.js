const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const logChannelTypeStore = require('./logChannelTypeStore');
const { LOG_CHANNEL_LABELS } = require('./logConfigManager');
const { applyDefaultColour } = require('./guildColourStore');

const DEFAULT_COLOR = 0x5865f2;

async function buildLogConfigView(guild, selectedType, options = {}) {
  const guildId = guild?.id;
  const logTypes = Object.values(logChannelTypeStore.LOG_TYPES);
  const entries = guildId ? await logChannelTypeStore.getAll(guildId) : {};

  const validTypes = logTypes.filter(Boolean);
  let activeType = selectedType && validTypes.includes(selectedType) ? selectedType : validTypes[0];
  if (!activeType && validTypes.length) activeType = validTypes[0];

  const selectedEntry = activeType ? entries[activeType] : null;
  const friendlySelected = activeType ? (LOG_CHANNEL_LABELS[activeType] || activeType) : 'None';

  const descriptionParts = ['Use the dropdown below to pick a category, toggle it, and assign a channel.'];
  if (options.note) descriptionParts.push(options.note);

  const embed = new EmbedBuilder()
    .setTitle('Logging configuration')
    .setDescription(descriptionParts.join('\n\n'))
    .setColor(DEFAULT_COLOR)
    .setTimestamp(new Date());

  const fields = validTypes.map(type => {
    const entry = entries[type] || { channelId: null, enabled: true };
    const friendly = LOG_CHANNEL_LABELS[type] || type;
    const status = entry.enabled ? 'Enabled ✅' : 'Disabled ❌';
    const channelDisplay = entry.channelId ? `<#${entry.channelId}>` : '*No channel configured*';
    return {
      name: `${friendly}`,
      value: `${status}\nChannel: ${channelDisplay}`,
      inline: true,
    };
  });

  if (fields.length) embed.addFields(fields);

  if (activeType) {
    const statusText = selectedEntry?.enabled ? 'Enabled ✅' : 'Disabled ❌';
    const channelText = selectedEntry?.channelId ? `<#${selectedEntry.channelId}>` : 'None';
    embed.addFields({
      name: `Selected: ${friendlySelected}`,
      value: `Status: ${statusText}\nChannel: ${channelText}`,
      inline: false,
    });
  }

  try {
    applyDefaultColour(embed, guildId);
  } catch (_) {}

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('logconfig:category')
      .setPlaceholder('Select category to configure')
      .addOptions(validTypes.map(type => {
        const entry = entries[type] || { channelId: null, enabled: true };
        const friendly = LOG_CHANNEL_LABELS[type] || type;
        return {
          label: friendly,
          value: type,
          description: entry.enabled ? 'Enabled' : 'Disabled',
          default: type === activeType,
        };
      }))
  );

  const toggleButton = new ButtonBuilder()
    .setCustomId(`logconfig:toggle:${activeType ?? 'none'}`)
    .setLabel(activeType ? `${selectedEntry?.enabled ? 'Disable' : 'Enable'} ${friendlySelected}` : 'Select a category')
    .setStyle(selectedEntry?.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    .setDisabled(!activeType);

  const defaultButton = new ButtonBuilder()
    .setCustomId(`logconfig:default:${activeType ?? 'none'}`)
    .setLabel('Auto-create default channel')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!activeType);

  const buttonRow = new ActionRowBuilder().addComponents(toggleButton, defaultButton);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`logconfig:setchannel:${activeType ?? 'none'}`)
    .setPlaceholder(activeType ? `Choose channel for ${friendlySelected}` : 'Select a category first')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!activeType);

  const channelRow = new ActionRowBuilder().addComponents(channelSelect);

  return {
    embed,
    components: [selectMenu, buttonRow, channelRow],
    selectedType: activeType,
  };
}

module.exports = { buildLogConfigView };
