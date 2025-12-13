const { Events, PermissionsBitField, EmbedBuilder } = require('discord.js');
const store = require('../utils/autorolesStore');
const jlStore = require('../utils/joinLeaveStore');
const welcomeStore = require('../utils/welcomeStore');
const blacklist = require('../utils/blacklistStore');
const logSender = require('../utils/logSender');
const inviteTracker = require('../utils/inviteTracker');
const { buildLogEmbed } = require('../utils/logEmbedFactory');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            const info = await blacklist.get(member.guild.id, member.id);
            if (info) {
                try {
                    await member.send(`You are blacklisted from ${member.guild.name}. Reason: ${info.reason || 'No reason provided'}`);
                } catch (_) {}
                try {
                    await member.ban({ reason: `Blacklisted: ${info.reason || 'No reason provided'}` });

                    // Log the auto-ban
                    const embed = new EmbedBuilder()
                        .setTitle('🚫 Member Auto-Banned (Blacklist)')
                        .setColor(0xff0000)
                        .addFields(
                            { name: 'User', value: `${member.user.tag} (${member.id})`, inline: false },
                            { name: 'Reason', value: info.reason || 'No reason provided', inline: false },
                            { name: 'Guild', value: `${member.guild.name} (${member.guild.id})`, inline: false }
                        )
                        .setTimestamp();

                    await logSender.sendLog({
                        guildId: member.guild.id,
                        logType: 'member',
                        embed,
                        client: member.client,
                    });
                } catch (err) {
                    console.error('Failed to auto-ban blacklisted user:', err);
                }
                return;
            }
        } catch (_) {}

        try {
            // Record join
            try { jlStore.addEvent(member.guild.id, member.id, 'join', Date.now()); } catch (_) {}

            const roleIds = store.getGuildRoles(member.guild.id);
            if (!roleIds.length) return;

            const me = member.guild.members.me;
            if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

            const assignable = roleIds
                .map(id => member.guild.roles.cache.get(id))
                .filter(r => r && !r.managed && me.roles.highest.comparePositionTo(r) > 0);

            if (!assignable.length) return;

            await member.roles.add(assignable, 'AutoRoles assignment');
        } catch (err) {
            // Avoid crashing on assignment errors
            console.error('AutoRoles error:', err);
        }

        // Send welcome embed if configured (best-effort; do not block joins)
        try {
            const cfg = welcomeStore.get(member.guild.id);
            if (!cfg || !cfg.channelId || !cfg.embed) return;
            const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
            if (!channel || !channel.isTextBased?.()) return;

            // Build embed from stored JSON and replace placeholders in text fields
            const replacer = (s) => String(s || '')
                .replaceAll('{user}', `${member.user.tag}`)
                .replaceAll('{mention}', `<@${member.id}>`)
                .replaceAll('{guild}', `${member.guild.name}`)
                .replaceAll('{memberCount}', `${member.guild.memberCount}`);

            const base = EmbedBuilder.from(cfg.embed);
            const data = base.toJSON();
            if (data.title) base.setTitle(replacer(data.title));
            if (data.description) base.setDescription(replacer(data.description));
            if (data.footer?.text) base.setFooter({ text: replacer(data.footer.text), iconURL: data.footer.icon_url || undefined });

            await channel.send({ content: replacer('Welcome {mention}!'), embeds: [base] });
        } catch (e) {
            // swallow
        }

        // Log the member join to the member log channel
        try {
            const embed = buildLogEmbed({
                action: 'Member Joined',
                target: member.user,
                actor: member.user,
                reason: 'Member joined the server',
                color: 0x2b2d31,
                extraFields: [
                    { name: 'Account created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Guild', value: `${member.guild.name} (${member.guild.id})`, inline: true },
                ],
            });

            await logSender.sendLog({
                guildId: member.guild.id,
                logType: 'member',
                embed,
                client: member.client,
            });
        } catch (err) {
            console.error('Failed to log member join:', err);
        }

        // Attempt to detect the invite used
        try {
            const usedInvite = await inviteTracker.handleMemberJoin(member);
            if (usedInvite) {
                const inviteEmbed = buildLogEmbed({
                    action: 'Invite Used',
                    target: member.user,
                    actor: member.user,
                    reason: `Invite ${usedInvite.code} used`,
                    color: 0x5865f2,
                    extraFields: [
                        { name: 'Channel', value: usedInvite.channelId ? `<#${usedInvite.channelId}>` : 'Unknown', inline: true },
                        {
                            name: 'Inviter',
                            value: usedInvite.inviterTag ? `${usedInvite.inviterTag} (${usedInvite.inviterId})` : 'Unknown',
                            inline: true,
                        },
                        { name: 'Uses', value: `${usedInvite.uses}${usedInvite.maxUses ? ` / ${usedInvite.maxUses}` : ''}`, inline: true },
                    ],
                });

                await logSender.sendLog({
                    guildId: member.guild.id,
                    logType: 'invite',
                    embed: inviteEmbed,
                    client: member.client,
                });
            }
        } catch (err) {
            console.error('Failed to log invite usage:', err);
        }
    },
};
