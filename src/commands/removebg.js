const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const backgroundRemover = require('../utils/backgroundRemover');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removebg')
        .setDescription('Remove the background from an image (free, unlimited, local)')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Attach an image to process')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('URL of the image to process')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            console.log(`[removebg] invoked by ${interaction.user?.id} in ${interaction.guild?.id}`);
        } catch (_) {}

        let imageUrl = interaction.options.getString('image_url');

        // Check for attachment if no URL is provided
        if (!imageUrl) {
            const attachment = interaction.options.getAttachment?.('image');
            if (attachment) {
                imageUrl = attachment.url;
            } else if (interaction.options._hoistedOptions) {
                // For Discord.js v14, attachments are in _hoistedOptions
                const fileAttachment = interaction.options._hoistedOptions.find(opt => opt.attachment);
                if (fileAttachment) imageUrl = fileAttachment.attachment.url;
            }
        }

        // If still no image, check message attachments (for context menu or fallback)
        if (!imageUrl && interaction.targetMessage?.attachments?.size) {
            imageUrl = interaction.targetMessage.attachments.first().url;
        }

        if (!imageUrl) {
            await interaction.editReply('Please provide an image URL or attach an image.');
            return;
        }

        try {
            console.log(`[removebg] Processing image: ${imageUrl}`);

            // Show processing status
            await interaction.editReply('🔄 Processing image... This may take a moment.');

            // Remove background using local rembg
            const outputBuffer = await backgroundRemover.removeBackground(imageUrl);

            const attachment = new AttachmentBuilder(outputBuffer, { name: 'no-bg.png' });

            try {
                await interaction.editReply({
                    content: '✅ Background removed successfully!',
                    files: [attachment]
                });
            } catch (e) {
                try {
                    await interaction.followUp({
                        content: '✅ Background removed successfully!',
                        files: [attachment]
                    });
                } catch (_) {}
            }

            console.log(`[removebg] Success for: ${imageUrl.slice(0, 50)}...`);
        } catch (error) {
            console.error(`[removebg] Error:`, error);
            try {
                await interaction.editReply({
                    content: `❌ Failed to remove background: ${error.message}`,
                });
            } catch (_) {
                try {
                    await interaction.followUp({
                        content: `❌ Failed to remove background: ${error.message}`,
                    });
                } catch (_) {}
            }
        }
    },
};
