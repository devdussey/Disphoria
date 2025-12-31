const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const PANEL_DESCRIPTION = [
  'Step 1. Figure out your exact hex codes you would like first. If you are unsure, visit https://www.eggradients.com/tool/discord-color-codes first. Primary is the left side and Secondary is right side of your username. (When picking gradiants) Alternatively, if you would rather not have gradiant, just put your hex code in for primary and leave secondary blank.',
  '',
  'Step 2. Hit the green button below when ready.',
  '',
  'Step 3. Fill in the boxes of the modal. Role Name is quite self explanitory. The Boxes underneath you will need to enter your colours in this format: #ff0000',
  '',
  'Step 4. When you are finished, hit the finish button and the bot does the rest. if this has errors, let a admin know please.',
].join('\n');

function buildBoosterRolePanel() {
  const embed = new EmbedBuilder()
    .setColor(0x00f9ff)
    .setDescription(PANEL_DESCRIPTION);

  const button = new ButtonBuilder()
    .setCustomId('brconfig:open')
    .setLabel('Click Here')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, row };
}

async function postBoosterRolePanel(channel, previousMessageId = null) {
  if (!channel?.isTextBased?.()) {
    throw new Error('Invalid channel for booster role panel.');
  }

  if (previousMessageId) {
    try {
      const oldMessage = await channel.messages.fetch(previousMessageId);
      if (oldMessage) {
        await oldMessage.delete();
      }
    } catch (_) {}
  }

  const { embed, row } = buildBoosterRolePanel();
  return channel.send({ embeds: [embed], components: [row] });
}

module.exports = {
  buildBoosterRolePanel,
  postBoosterRolePanel,
};
