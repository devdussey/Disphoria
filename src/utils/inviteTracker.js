const inviteCache = new Map();

function serializeInvite(invite) {
  if (!invite) return null;
  return {
    code: invite.code,
    uses: typeof invite.uses === 'number' ? invite.uses : 0,
    maxUses: typeof invite.maxUses === 'number' ? invite.maxUses : null,
    inviterId: invite.inviter?.id || invite.inviterId || null,
    inviterTag: invite.inviter?.tag || null,
    channelId: invite.channelId || invite.channel?.id || null,
    expiresAt: invite.expiresAt ? (invite.expiresAt instanceof Date ? invite.expiresAt.getTime() : invite.expiresAt) : null,
    temporary: typeof invite.temporary === 'boolean' ? invite.temporary : null,
    guildId: invite.guild?.id || invite.guildId || null,
    targetType: invite.targetType || null,
    targetUserId: invite.targetUser?.id || invite.targetUserId || null,
    url: invite.url || null,
  };
}

async function refreshGuildInvites(guild) {
  if (!guild || !guild.id) return null;
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const invite of invites.values()) {
      const serialized = serializeInvite(invite);
      if (serialized?.code) map.set(serialized.code, serialized);
    }
    inviteCache.set(guild.id, map);
    return map;
  } catch (err) {
    console.error(`Failed to refresh invites for ${guild.id}:`, err);
    inviteCache.set(guild.id, new Map());
    return null;
  }
}

async function initialize(client) {
  const guilds = client?.guilds?.cache?.values ? client.guilds.cache.values() : [];
  for (const guild of guilds) {
    await refreshGuildInvites(guild);
  }
}

function addInvite(invite) {
  const guildId = invite?.guildId || invite?.guild?.id;
  if (!guildId || !invite?.code) return;
  const map = inviteCache.get(guildId) || new Map();
  map.set(invite.code, serializeInvite(invite));
  inviteCache.set(guildId, map);
}

function removeInvite(guildId, code) {
  if (!guildId || !code) return;
  const map = inviteCache.get(guildId);
  if (!map) return;
  map.delete(code);
  inviteCache.set(guildId, map);
}

async function handleMemberJoin(member) {
  const guild = member?.guild;
  if (!guild) return null;
  const previous = inviteCache.get(guild.id);
  const snapshot = previous ? new Map(previous) : null;
  const current = await refreshGuildInvites(guild);
  if (!snapshot || !current) return null;
  for (const [code, invite] of current.entries()) {
    const previousInvite = snapshot.get(code);
    const previousUses = previousInvite?.uses ?? 0;
    if (typeof invite.uses === 'number' && invite.uses > previousUses) {
      return invite;
    }
  }
  return null;
}

module.exports = {
  initialize,
  refreshGuildInvites,
  addInvite,
  removeInvite,
  handleMemberJoin,
};
