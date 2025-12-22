const {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const logger = require('../utils/securityLogger');
const { isOwner } = require('../utils/ownerIds');
const premiumManager = require('../utils/premiumManager');

// In-memory store for active isolations per guild+user
// Key: `${guildId}:${userId}` -> { channelId, intervalId, stopAt }
const activeIsolations = new Map();

function key(gid, uid) { return `${gid}:${uid}`; }

function parseDuration(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^([0-9]+)\s*([smhd])$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return n * mult;
}

function parseBooleanInput(value) {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (['true', 't', 'yes', 'y', '1', 'on'].includes(raw)) return true;
  if (['false', 'f', 'no', 'n', '0', 'off'].includes(raw)) return false;
  return null;
}

function parseIntInput(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function createWraithStartModal(ownerId, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`wraith:start:${ownerId}:${targetId}`)
    .setTitle('Configure Wraith');

  const messageInput = new TextInputBuilder()
    .setCustomId('wraith:message')
    .setLabel('Message to repeat')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1900)
    .setPlaceholder('What should the Wraith say?');

  const durationInput = new TextInputBuilder()
    .setCustomId('wraith:duration')
    .setLabel('Duration (optional, max 15m)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(8)
    .setPlaceholder('e.g. 2m, 10m, 1h');

  const intervalInput = new TextInputBuilder()
    .setCustomId('wraith:interval')
    .setLabel('Interval seconds (1-60, default 5)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(3)
    .setPlaceholder('5');

  const maxInput = new TextInputBuilder()
    .setCustomId('wraith:max')
    .setLabel('Max messages (5-500, default 120)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(4)
    .setPlaceholder('120');

  const hideInput = new TextInputBuilder()
    .setCustomId('wraith:hide')
    .setLabel('Hide other channels from member? (true/false)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(5)
    .setPlaceholder('false');

  modal.addComponents(
    new ActionRowBuilder().addComponents(messageInput),
    new ActionRowBuilder().addComponents(durationInput),
    new ActionRowBuilder().addComponents(intervalInput),
    new ActionRowBuilder().addComponents(maxInput),
    new ActionRowBuilder().addComponents(hideInput),
  );

  return modal;
}

async function runWraithStart(interaction, member, options) {
  const durationStr = options?.durationStr ?? null;
  const intervalSec = options?.intervalSec ?? 5;
  const maxMsgs = options?.maxMessages ?? 120;
  const customMsg = options?.message ?? null;
  const hideOthers = options?.hideOthers ?? false;

  // Safety caps
  const intervalMs = Math.max(1, Math.min(60, intervalSec)) * 1000;
  const durationMsRaw = parseDuration(durationStr);
  const durationMs = durationMsRaw ? Math.min(durationMsRaw, 15 * 60 * 1000) : null; // cap 15m
  const maxMessages = Math.min(Math.max(5, maxMsgs), 500);

  const k = key(interaction.guild.id, member.id);
  if (activeIsolations.has(k)) {
    const existing = activeIsolations.get(k);
    await interaction.editReply({ content: `Already isolating <@${member.id}> in <#${existing.channelId}>. Use /wraith stop to end.`, ephemeral: true });
    return;
  }

  const me = interaction.guild.members.me;

  // Create or reuse a private channel
  const baseName = `isolate-${member.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`.replace(/-+/g, '-').slice(0, 90);
  const channelName = baseName || `isolate-${member.id}`;

  // Permission overwrites: deny @everyone, allow target, allow owner, allow bot
  const overwrites = [
    { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] },
    { id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
  ];

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: overwrites,
      reason: `Isolation channel for ${member.user.tag} started by ${interaction.user.tag}`,
    });
  } catch (err) {
    await interaction.editReply({ content: `Failed to create channel: ${err.message}`, ephemeral: true });
    return;
  }

  await interaction.editReply({
    content: `Created <#${channel.id}>. Starting spam for ${durationMs ? Math.round(durationMs / 60000) + 'm' : 'a while'} at ~${Math.round(intervalMs / 1000)}s interval (max ${maxMessages} msgs).${hideOthers ? ' Hiding other channels for the member during wraith.' : ''}`,
    ephemeral: true,
  });

  // Optionally hide all other channels from the member by adding a temporary user overwrite
  let hiddenOverwrites = [];
  if (hideOthers) {
    for (const ch of interaction.guild.channels.cache.values()) {
      try {
        if (!ch || ch.id === channel.id) continue;
        // Skip threads - cannot manage overwrites the same way
        if (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread) continue;
        if (!ch.permissionOverwrites || typeof ch.permissionOverwrites.edit !== 'function') continue;
        const canView = ch.permissionsFor?.(member)?.has(PermissionsBitField.Flags.ViewChannel);
        if (!canView) continue; // already hidden
        const existing = ch.permissionOverwrites.resolve(member.id);
        if (existing) {
          hiddenOverwrites.push({ channelId: ch.id, existed: true, allow: existing.allow?.bitfield, deny: existing.deny?.bitfield });
        } else {
          hiddenOverwrites.push({ channelId: ch.id, existed: false });
        }
        await ch.permissionOverwrites.edit(member.id, { ViewChannel: false, reason: `Wraith hide by ${interaction.user.tag}` });
      } catch (_) { /* ignore individual channel failures */ }
    }
  }

  const stopAt = durationMs ? Date.now() + durationMs : null;
  let sent = 0;
  const text = customMsg || 'Your isolation has begun.';

  const createEmbed = (count) => new EmbedBuilder()
    .setTitle('👻 The Wraith Draws Near')
    .setDescription('You have been isolated. Stay put and cooperate to end the haunting.')
    .setColor(0x4b0082)
    .setFooter({ text: `Pulse ${count}${maxMessages ? ` · Max ${maxMessages}` : ''}` })
    .setTimestamp();

  const sendOne = async (count) => {
    try {
      await channel.send({ content: `<@${member.id}> ${text}`.slice(0, 2000), embeds: [createEmbed(count)] });
    } catch (_) { /* ignore send errors during loop */ }
  };

  // Immediately send first message
  await sendOne(sent + 1);
  sent++;

  const intervalId = setInterval(async () => {
    if (stopAt && Date.now() >= stopAt) {
      clearInterval(intervalId);
      activeIsolations.delete(k);
      try { await channel.send({ content: 'Stopping.' }); } catch (_) {}
      return;
    }
    if (sent >= maxMessages) {
      clearInterval(intervalId);
      activeIsolations.delete(k);
      try { await channel.send({ content: 'Reached max messages. Stopping.' }); } catch (_) {}
      return;
    }
    sent++;
    await sendOne(sent);
  }, intervalMs);

  activeIsolations.set(k, { channelId: channel.id, intervalId, stopAt, hiddenOverwrites });
}

async function handleWraithStartModalSubmit(interaction, targetId) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
  }

  if (!(await premiumManager.ensurePremium(interaction, 'Wraith isolation'))) return;

  // Bot owner-only check
  if (!isOwner(interaction.user.id)) {
    try { await logger.logPermissionDenied(interaction, 'wraith', 'User is not a bot owner'); } catch (_) {}
    return interaction.reply({ content: 'This command is restricted to bot owners.', ephemeral: true });
  }

  const me = interaction.guild.members.me;
  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: 'I need Manage Channels permission to create private channels.', ephemeral: true });
  }

  let member;
  try { member = await interaction.guild.members.fetch(targetId); } catch (_) {}
  if (!member) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
  if (member.user?.bot) return interaction.reply({ content: 'Target must be a human member.', ephemeral: true });

  const message = (interaction.fields.getTextInputValue('wraith:message') || '').trim();
  const durationStr = (interaction.fields.getTextInputValue('wraith:duration') || '').trim();
  const intervalRaw = (interaction.fields.getTextInputValue('wraith:interval') || '').trim();
  const maxRaw = (interaction.fields.getTextInputValue('wraith:max') || '').trim();
  const hideRaw = (interaction.fields.getTextInputValue('wraith:hide') || '').trim();

  if (!message) return interaction.reply({ content: 'Message is required.', ephemeral: true });

  if (durationStr && !parseDuration(durationStr)) {
    return interaction.reply({ content: "Invalid duration. Use formats like '2m', '10m', '1h' (max 15m).", ephemeral: true });
  }

  const intervalParsed = parseIntInput(intervalRaw);
  if (intervalRaw && (intervalParsed == null || intervalParsed < 1 || intervalParsed > 60)) {
    return interaction.reply({ content: 'Invalid interval. Enter a number of seconds from 1 to 60.', ephemeral: true });
  }

  const maxParsed = parseIntInput(maxRaw);
  if (maxRaw && (maxParsed == null || maxParsed < 5 || maxParsed > 500)) {
    return interaction.reply({ content: 'Invalid max messages. Enter a number from 5 to 500.', ephemeral: true });
  }

  const hideParsed = parseBooleanInput(hideRaw);
  if (hideRaw && hideParsed == null) {
    return interaction.reply({ content: "Invalid hide value. Use 'true' or 'false'.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  await runWraithStart(interaction, member, {
    message,
    durationStr: durationStr || null,
    intervalSec: intervalParsed ?? 5,
    maxMessages: maxParsed ?? 120,
    hideOthers: hideParsed ?? false,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wraith')
    .setDescription('invoke wraith')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Open a modal to configure and start a wraith isolation.')
        .addUserOption(opt => opt.setName('member').setDescription('Member to isolate').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Stop spamming the member and optionally delete the channel.')
        .addUserOption(opt => opt.setName('member').setDescription('Member to stop isolating').setRequired(true))
        .addBooleanOption(opt => opt.setName('delete').setDescription('Delete the private channel (default: true)').setRequired(false))
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
    }

    if (!(await premiumManager.ensurePremium(interaction, 'Wraith isolation'))) return;

    // Bot owner-only check
    if (!isOwner(interaction.user.id)) {
      try { await logger.logPermissionDenied(interaction, 'wraith', 'User is not a bot owner'); } catch (_) {}
      return interaction.reply({ content: 'This command is restricted to bot owners.', ephemeral: true });
    }

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: 'I need Manage Channels permission to create private channels.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const target = interaction.options.getUser('member', true);
      if (target.bot) {
        return interaction.reply({ content: 'Target must be a human member.', ephemeral: true });
      }

      let member;
      try { member = await interaction.guild.members.fetch(target.id); } catch (_) {}
      if (!member) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });

      const k = key(interaction.guild.id, member.id);
      if (activeIsolations.has(k)) {
        const existing = activeIsolations.get(k);
        return interaction.reply({ content: `Already isolating <@${member.id}> in <#${existing.channelId}>. Use /wraith stop to end.`, ephemeral: true });
      }

      const modal = createWraithStartModal(interaction.user.id, target.id);
      try {
        await interaction.showModal(modal);
      } catch (_) {
        return interaction.reply({ content: 'Could not open the wraith configuration modal. Please try again.', ephemeral: true });
      }
      return;
    }

    if (sub === 'stop') {
      const target = interaction.options.getUser('member', true);
      const del = interaction.options.getBoolean('delete');
      const k = key(interaction.guild.id, target.id);
      const rec = activeIsolations.get(k);
      if (!rec) {
        return interaction.reply({ content: `No active isolation found for <@${target.id}>.`, ephemeral: true });
      }
      activeIsolations.delete(k);
      try { clearInterval(rec.intervalId); } catch (_) {}

      let channel = null;
      try { channel = await interaction.guild.channels.fetch(rec.channelId); } catch (_) {}
      if (channel && del !== false) {
        try { await channel.delete('Isolation stopped by owner'); } catch (_) {}
      } else if (channel) {
        try { await channel.send({ content: 'Isolation stopped by owner.' }); } catch (_) {}
      }

      // Restore hidden channels if applicable
      const memberId = target.id;
      if (rec.hiddenOverwrites && Array.isArray(rec.hiddenOverwrites) && rec.hiddenOverwrites.length) {
        for (const info of rec.hiddenOverwrites) {
          try {
            const ch = await interaction.guild.channels.fetch(info.channelId);
            if (!ch || !ch.permissionOverwrites) continue;
            if (info.existed) {
              await ch.permissionOverwrites.edit(memberId, { allow: info.allow, deny: info.deny, reason: 'Restore after wraith' });
            } else {
              await ch.permissionOverwrites.delete(memberId, 'Restore after wraith');
            }
          } catch (_) { /* ignore individual failures */ }
        }
      }
      return interaction.reply({ content: `Stopped isolation for <@${target.id}>${channel ? (del !== false ? ' and deleted channel.' : ' and kept channel.') : '.'}`, ephemeral: true });
    }

    return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  },
  handleWraithStartModalSubmit,
};
