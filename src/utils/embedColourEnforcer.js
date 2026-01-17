const {
  EmbedBuilder,
  BaseInteraction,
  BaseGuildTextChannel,
  TextChannel,
  NewsChannel,
  ThreadChannel,
  StageChannel,
  VoiceChannel,
  ForumChannel,
  DMChannel,
  WebhookClient,
} = require('discord.js');
const { resolveEmbedColour } = require('./guildColourStore');

function normalizeEmbeds(rawEmbeds, guildId) {
  if (!Array.isArray(rawEmbeds) || !guildId) return rawEmbeds;
  const colour = resolveEmbedColour(guildId);
  return rawEmbeds.map((embed) => {
    try {
      const builder = embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed);
      builder.setColor(colour);
      return builder;
    } catch (_) {
      return embed;
    }
  });
}

function applyColour(payload, guildId) {
  if (!guildId || !payload || typeof payload !== 'object') return payload;
  const next = Array.isArray(payload) ? payload : { ...payload };
  const embeds = Array.isArray(next.embeds)
    ? next.embeds
    : next.embeds
      ? [next.embeds]
      : null;

  if (!embeds || embeds.length === 0) return payload;

  const coloured = normalizeEmbeds(embeds, guildId);
  if (Array.isArray(payload)) return coloured;
  return { ...next, embeds: coloured };
}

function patchMethod(target, method, guildResolver) {
  if (!target || typeof target[method] !== 'function') return;
  if (target[method].__embedColourPatched) return;
  const original = target[method];
  target[method] = function patched(options, ...rest) {
    const guildId = guildResolver?.call(this, options, ...rest);
    const patchedOptions = guildId ? applyColour(options, guildId) : options;
    return original.call(this, patchedOptions, ...rest);
  };
  target[method].__embedColourPatched = true;
}

function resolveGuildIdFromInteraction(options) {
  return this.guildId || this.guild?.id || this.channel?.guild?.id || options?.guildId || null;
}

function resolveGuildIdFromChannel() {
  return this?.guild?.id || null;
}

function resolveGuildIdFromWebhook(options) {
  return options?.guildId || null;
}

// Patch common interaction reply helpers
patchMethod(BaseInteraction.prototype, 'reply', resolveGuildIdFromInteraction);
patchMethod(BaseInteraction.prototype, 'editReply', resolveGuildIdFromInteraction);
patchMethod(BaseInteraction.prototype, 'followUp', resolveGuildIdFromInteraction);
patchMethod(BaseInteraction.prototype, 'update', resolveGuildIdFromInteraction);

// Patch channel send/edit helpers
[
  BaseGuildTextChannel?.prototype,
  TextChannel?.prototype,
  NewsChannel?.prototype,
  ThreadChannel?.prototype,
  StageChannel?.prototype,
  VoiceChannel?.prototype,
  ForumChannel?.prototype,
  DMChannel?.prototype,
].forEach(proto => patchMethod(proto, 'send', resolveGuildIdFromChannel));

// Patch webhook client sends
patchMethod(WebhookClient?.prototype, 'send', resolveGuildIdFromWebhook);

module.exports = {
  applyColour,
};
