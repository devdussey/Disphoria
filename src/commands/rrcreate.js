const { SlashCommandBuilder, PermissionsBitField, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const logger = require('../utils/securityLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rrcreate')
        .setDescription('Create a reaction-role select menu (via modal)'),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'Use this command in a server.', ephemeral: true });
        }

        const me = interaction.guild.members.me;
        if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            await logger.logPermissionDenied(interaction, 'rrcreate', 'Bot missing Manage Roles');
            return interaction.reply({ content: 'I need the Manage Roles permission.', ephemeral: true });
        }

        if (!interaction.member.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            await logger.logPermissionDenied(interaction, 'rrcreate', 'User missing Manage Roles');
            return interaction.reply({ content: 'You need Manage Roles to create reaction roles.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`rrcreate:submit:${interaction.user.id}`)
            .setTitle('Create Reaction Roles');

        const titleInput = new TextInputBuilder()
            .setCustomId('rr:title')
            .setLabel('Embed title (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(256);

        const descInput = new TextInputBuilder()
            .setCustomId('rr:description')
            .setLabel('Embed description (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(4000);

        const imageInput = new TextInputBuilder()
            .setCustomId('rr:image')
            .setLabel('Embed image URL (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(400);

        const placeholderInput = new TextInputBuilder()
            .setCustomId('rr:placeholder')
            .setLabel('Select menu placeholder (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100);

        const optionsInput = new TextInputBuilder()
            .setCustomId('rr:options')
            .setLabel('Options (one per line)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setPlaceholder('<@&ROLE_ID> | Label | Description | Emoji\n123456789012345678 | Gamer | Get the gamer role | 🎮');

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(imageInput),
            new ActionRowBuilder().addComponents(placeholderInput),
            new ActionRowBuilder().addComponents(optionsInput),
        );

        await interaction.showModal(modal);
    },
};

