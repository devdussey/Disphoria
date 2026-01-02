const { SlashCommandBuilder, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const reactionRoleStore = require('../utils/reactionRoleStore');
const reactionRoleManager = require('../utils/reactionRoleManager');
const { parseColorInput } = require('../utils/colorParser');

function parseRoleIds(input) {
  const matches = String(input || '').match(/\d{17,20}/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

function parseEmojiTokens(input) {
  const matches = String(input || '').match(/<a?:\w+:\d+>|[^\s,]+/g);
  return matches ? matches.filter(Boolean) : [];
}

function parseEmojiToken(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) return null;
  const customMatch = trimmed.match(/^<a?:(\w+):(\d+)>$/);
  if (customMatch) {
    const animated = trimmed.startsWith('<a:');
    return {
      id: customMatch[2],
      name: customMatch[1],
      animated: animated ? true : undefined,
    };
  }
  return trimmed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rredit')
    .setDescription('Edit an existing reaction role panel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
    .setDMPermission(false)
    .addIntegerOption(opt =>
      opt
        .setName('id')
        .setDescription('Reaction role panel ID')
    )
    .addStringOption(opt =>
      opt
        .setName('message_id')
        .setDescription('Message ID that has the menu attached')
    )
    .addStringOption(opt =>
      opt
        .setName('roles')
        .setDescription('Role mentions or IDs to replace the panel roles')
    )
    .addStringOption(opt =>
      opt
        .setName('add_roles')
        .setDescription('Roles to add (mention or ID, space/comma separated)')
    )
    .addStringOption(opt =>
      opt
        .setName('remove_roles')
        .setDescription('Roles to remove (mention or ID, space/comma separated)')
    )
    .addStringOption(opt =>
      opt
        .setName('emojis')
        .setDescription('Optional emoji list aligned to the final roles (same order)')
    )
    .addBooleanOption(opt =>
      opt
        .setName('allow_multiple')
        .setDescription('Allow selecting multiple roles (default keeps current setting)')
    )
    .addStringOption(opt =>
      opt
        .setName('content')
        .setDescription('Replace the message content')
    )
    .addBooleanOption(opt =>
      opt
        .setName('embed')
        .setDescription('Update or remove the embed (true = keep/add, false = remove)')
    )
    .addStringOption(opt =>
      opt
        .setName('embed_colour')
        .setDescription('Embed colour (hex or name)')
    )
    .addStringOption(opt =>
      opt
        .setName('embed_image_url')
        .setDescription('Image URL to show in the embed')
    )
    .addAttachmentOption(opt =>
      opt
        .setName('embed_image_upload')
        .setDescription('Upload an image to show in the embed')
    )
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel containing the target message (defaults to stored channel)')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: 'I need the Manage Roles permission.', ephemeral: true });
    }
    if (!interaction.member.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: 'You need Manage Roles to edit reaction roles.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const id = interaction.options.getInteger('id');
    const messageIdOpt = interaction.options.getString('message_id');
    if (!id && !messageIdOpt) {
      return interaction.editReply({ content: 'Provide a panel ID or message ID to edit.' });
    }

    let panel = null;
    if (id) panel = reactionRoleStore.getPanel(interaction.guildId, id);
    if (!panel && messageIdOpt) {
      panel = reactionRoleStore.findPanelByMessageId(interaction.guildId, messageIdOpt);
    }
    if (!panel) {
      return interaction.editReply({ content: 'No matching reaction role panel was found.' });
    }

    const targetChannel = interaction.options.getChannel('channel') || await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased?.()) {
      return interaction.editReply({ content: 'Select a text-based channel for the reaction roles message.' });
    }

    let targetMessage = null;
    try { targetMessage = await targetChannel.messages.fetch(panel.messageId); } catch (_) {}
    if (!targetMessage) {
      return interaction.editReply({ content: 'Could not find the stored message for this panel.' });
    }
    if (!targetMessage.editable) {
      return interaction.editReply({ content: 'I can only edit messages I have permission to modify.' });
    }

    const rolesInput = interaction.options.getString('roles');
    const addRolesInput = interaction.options.getString('add_roles');
    const removeRolesInput = interaction.options.getString('remove_roles');
    const emojisInput = interaction.options.getString('emojis');
    const allowMultipleOpt = interaction.options.getBoolean('allow_multiple');
    const contentInput = interaction.options.getString('content');
    const embedOpt = interaction.options.getBoolean('embed');
    const embedColourInput = interaction.options.getString('embed_colour');
    const embedImageUrlInput = (interaction.options.getString('embed_image_url') || '').trim();
    const embedImageUpload = interaction.options.getAttachment('embed_image_upload') || null;

    let roleIds = rolesInput ? parseRoleIds(rolesInput) : Array.from(panel.roleIds || []);
    const addRoleIds = parseRoleIds(addRolesInput);
    const removeRoleIds = parseRoleIds(removeRolesInput);

    if (!rolesInput) {
      const roleSet = new Set(roleIds);
      for (const id of addRoleIds) roleSet.add(id);
      for (const id of removeRoleIds) roleSet.delete(id);
      roleIds = Array.from(roleSet);
    }

    if (roleIds.length > 25) roleIds = roleIds.slice(0, 25);

    const validRoles = [];
    const missingRoles = [];
    const blockedRoles = [];

    for (const id of roleIds) {
      if (id === interaction.guildId) {
        blockedRoles.push(id);
        continue;
      }
      let role = null;
      try { role = await interaction.guild.roles.fetch(id); } catch (_) {}
      if (!role) {
        missingRoles.push(id);
        continue;
      }
      if (role.managed) {
        blockedRoles.push(id);
        continue;
      }
      if (me.roles.highest.comparePositionTo(role) <= 0) {
        blockedRoles.push(id);
        continue;
      }
      validRoles.push(role);
    }

    if (!validRoles.length) {
      return interaction.editReply({ content: 'None of the provided roles can be managed by the bot.' });
    }

    const emojiMap = {};
    const existingEmojiMap = panel.emojis && typeof panel.emojis === 'object' ? panel.emojis : {};
    for (const role of validRoles) {
      if (Object.prototype.hasOwnProperty.call(existingEmojiMap, role.id)) {
        const emoji = existingEmojiMap[role.id];
        if (emoji) emojiMap[role.id] = emoji;
      }
    }

    if (emojisInput) {
      const emojiTokens = parseEmojiTokens(emojisInput);
      for (let i = 0; i < validRoles.length; i += 1) {
        const token = emojiTokens[i];
        if (!token) continue;
        const parsed = parseEmojiToken(token);
        if (!parsed) continue;
        emojiMap[validRoles[i].id] = parsed;
      }
    }

    const multi = allowMultipleOpt === null ? panel.multi : allowMultipleOpt;
    const updatedPanel = { ...panel, roleIds: validRoles.map(role => role.id), emojis: emojiMap, multi };
    const menu = reactionRoleManager.buildMenuRow(updatedPanel, interaction.guild);
    const merged = reactionRoleManager.upsertMenuRow(targetMessage.components, menu.customId, menu.row);
    if (!merged.ok) {
      return interaction.editReply({ content: 'That message already has the maximum number of component rows.' });
    }

    let embedsToUse = Array.isArray(targetMessage.embeds) ? targetMessage.embeds : [];
    let embedFiles = [];
    const shouldUpdateEmbed = embedOpt !== null || embedColourInput || embedImageUrlInput || embedImageUpload;

    if (embedOpt === false) {
      embedsToUse = [];
    } else if (shouldUpdateEmbed) {
      let imageUrl = null;
      if (embedImageUpload && embedImageUpload.contentType?.startsWith('image/')) {
        const fileName = embedImageUpload.name || 'image.png';
        imageUrl = `attachment://${fileName}`;
        embedFiles = [{ attachment: embedImageUpload.url, name: fileName }];
      } else if (embedImageUrlInput) {
        try {
          const parsedUrl = new URL(embedImageUrlInput);
          if (['http:', 'https:'].includes(parsedUrl.protocol)) {
            imageUrl = parsedUrl.toString();
          }
        } catch (_) {}
      }

      const firstEmbed = targetMessage.embeds?.[0];
      const existingColour = typeof firstEmbed?.data?.color === 'number'
        ? firstEmbed.data.color
        : (typeof firstEmbed?.color === 'number' ? firstEmbed.color : 0x00f9ff);
      const colour = parseColorInput(embedColourInput, existingColour || 0x00f9ff);
      const embed = firstEmbed ? EmbedBuilder.from(firstEmbed) : new EmbedBuilder();
      embed.setColor(colour);
      if (imageUrl) embed.setImage(imageUrl);
      embedsToUse = [embed];
    }

    const editPayload = {
      components: merged.rows,
    };
    if (contentInput !== null) editPayload.content = contentInput;
    if (shouldUpdateEmbed) editPayload.embeds = embedsToUse;
    if (embedFiles.length) editPayload.files = embedFiles;

    try {
      await targetMessage.edit(editPayload);
    } catch (err) {
      console.error('Failed to edit reaction role message:', err);
      return interaction.editReply({ content: 'Failed to update the reaction role message.' });
    }

    const stored = reactionRoleStore.updatePanel(interaction.guildId, panel.id, {
      roleIds: updatedPanel.roleIds,
      emojis: updatedPanel.emojis,
      multi: updatedPanel.multi,
    });

    if (!stored) {
      return interaction.editReply({ content: 'Updated the message, but failed to update the stored panel.' });
    }

    const link = `https://discord.com/channels/${interaction.guildId}/${targetChannel.id}/${targetMessage.id}`;
    const notes = [];
    if (missingRoles.length) notes.push('Some role IDs were not found.');
    if (blockedRoles.length) notes.push('Some roles could not be used due to role hierarchy or managed roles.');
    const tail = notes.length ? ` ${notes.join(' ')}` : '';

    return interaction.editReply({ content: `Reaction role panel #${panel.id} updated: ${link}.${tail}` });
  },
};
