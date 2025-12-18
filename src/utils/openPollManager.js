const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { MAX_ANSWERS } = require('./openPollStore');

function sanitiseNoMentions(text, maxLen) {
  return String(text || '')
    .trim()
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/@/g, '@\u200b')
    .replace(/#/g, '#\u200b')
    .replace(/&/g, '&\u200b')
    .slice(0, maxLen);
}

function buildAnswerLines(poll) {
  const answers = Array.isArray(poll?.answers) ? poll.answers : [];
  const safeAnswers = answers.slice(0, MAX_ANSWERS);
  return safeAnswers.map((a, idx) => {
    const text = sanitiseNoMentions(a?.text, 200) || '(blank)';
    const authorId = a?.authorId ? String(a.authorId) : null;
    const author = authorId ? `<@${authorId}>` : 'Unknown';
    return `${idx + 1}. ${text} — ${author}`;
  });
}

function chunkLinesToFields(lines) {
  if (!lines.length) return [];

  const fields = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > 1024) {
      if (current) fields.push(current);
      current = line.slice(0, 1024);
    } else {
      current = next;
    }
    if (fields.length >= 24) break;
  }
  if (current && fields.length < 25) fields.push(current);
  return fields;
}

function buildPollEmbed(poll, guildId) {
  const question = sanitiseNoMentions(poll?.question, 300) || 'Untitled poll';
  const status = poll?.open === false ? 'Closed' : 'Open';
  const creatorId = poll?.creatorId ? String(poll.creatorId) : null;

  const embed = new EmbedBuilder()
    .setTitle('Open Poll')
    .setDescription(`**Question:** ${question}\n**Status:** ${status}${creatorId ? `\n**Creator:** <@${creatorId}>` : ''}`)
    .setTimestamp();

  try {
    const { applyDefaultColour } = require('./guildColourStore');
    applyDefaultColour(embed, guildId);
  } catch (_) {
    embed.setColor(0x5865f2);
  }

  const lines = buildAnswerLines(poll);
  if (!lines.length) {
    embed.addFields({
      name: `Answers (0/${MAX_ANSWERS})`,
      value: '_No answers yet. Click **Add Answer** to add one._',
      inline: false,
    });
    return embed;
  }

  const chunks = chunkLinesToFields(lines);
  chunks.forEach((value, idx) => {
    embed.addFields({
      name: idx === 0 ? `Answers (${lines.length}/${MAX_ANSWERS})` : 'Answers (cont.)',
      value,
      inline: false,
    });
  });

  return embed;
}

function buildPollComponents(poll) {
  const pollId = String(poll?.id || '');

  const addAnswer = new ButtonBuilder()
    .setCustomId(`openpoll:add:${pollId}`)
    .setLabel('Add Answer')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(poll?.open === false);

  const toggle = new ButtonBuilder()
    .setCustomId(`openpoll:toggle:${pollId}`)
    .setLabel(poll?.open === false ? 'Open Poll' : 'Close Poll')
    .setStyle(poll?.open === false ? ButtonStyle.Success : ButtonStyle.Danger);

  return [new ActionRowBuilder().addComponents(addAnswer, toggle)];
}

function buildPollView(poll, guildId) {
  return {
    embeds: [buildPollEmbed(poll, guildId)],
    components: buildPollComponents(poll),
    allowedMentions: { parse: [] },
  };
}

async function updatePollMessage(client, poll) {
  const channelId = poll?.channelId ? String(poll.channelId) : null;
  const messageId = poll?.messageId ? String(poll.messageId) : null;
  const guildId = poll?.guildId ? String(poll.guildId) : null;

  if (!channelId || !messageId) return { ok: false, error: 'missing_message' };

  let channel = null;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (_) {}
  if (!channel || !channel.isTextBased?.()) return { ok: false, error: 'missing_channel' };

  let message = null;
  try {
    message = await channel.messages.fetch(messageId);
  } catch (_) {}
  if (!message) return { ok: false, error: 'missing_message' };

  await message.edit(buildPollView(poll, guildId));
  return { ok: true };
}

module.exports = {
  buildPollView,
  updatePollMessage,
};
