const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  getStoredColour,
  getDefaultColour,
  toHex6,
  DEFAULT_EMBED_COLOUR,
  resolveEmbedColour,
} = require('../utils/guildColourStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botsettings')
    .setDescription('View the bot settings and defaults for this server'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const storedColour = guildId ? getStoredColour(guildId) : null;
    const effectiveColour = getDefaultColour(guildId);

    const openAiConfigured = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_API);
    const chatModel = process.env.CHAT_MODEL || 'gpt-4o-mini';
    const analysisModel = process.env.ANALYSIS_MODEL || process.env.CHAT_MODEL || 'gpt-4o-mini';
    const summarizeModel = process.env.OPENAI_SUMMARIZE_MODEL || process.env.CHAT_MODEL || 'gpt-4o-mini';
    const transcribeModel = process.env.TRANSCRIBE_MODEL || 'whisper-1';
    const analysisPersonaCustom = !!(process.env.ANALYSIS_PERSONA_PROMPT && process.env.ANALYSIS_PERSONA_PROMPT.trim());

    const embedColourLines = [
      `Current: ${toHex6(effectiveColour)}`,
      storedColour == null
        ? `Source: bot default (${toHex6(DEFAULT_EMBED_COLOUR)}), no server override set.`
        : 'Source: server override via /setdefaultcolour.',
    ];

    const responseLines = [
      'Defaults for visible/silent replies:',
      '- Most setup/moderation commands reply privately.',
      '- /chat: public reply by default; set `private: true` to make it silent.',
      '- /analysis: private reply by default; set `public: true` to post in-channel.',
      '- /summarize: public reply (no private toggle).',
      '- /transcribe: private reply only.',
    ];

    const aiLines = [
      `OpenAI key: ${openAiConfigured ? 'configured' : 'not set'}`,
      `Chat model: ${chatModel}`,
      `Analysis model: ${analysisModel}`,
      `Summarize model: ${summarizeModel}`,
      `Transcribe model: ${transcribeModel}`,
    ];
    if (analysisPersonaCustom) {
      aiLines.push('Analysis persona: custom prompt set');
    }

    const embed = new EmbedBuilder()
      .setTitle('Bot Settings')
      .setDescription(interaction.inGuild() ? `Current settings for **${interaction.guild.name}**.` : 'Current bot settings.')
      .addFields(
        { name: 'Embed Colour', value: embedColourLines.join('\n'), inline: false },
        { name: 'Response Visibility', value: responseLines.join('\n'), inline: false },
        { name: 'AI Settings', value: aiLines.join('\n'), inline: false },
      )
      .setColor(resolveEmbedColour(guildId, DEFAULT_EMBED_COLOUR))
      .setTimestamp(new Date());

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
