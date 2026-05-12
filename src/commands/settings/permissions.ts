import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { MeloraClient } from '../../core/Client.js';
import { PermissionLevel, type SlashCommand } from '../../types/index.js';

export const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('permissions')
        .setDescription('Manage custom role mappings for Melora commands.')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View current role mappings.')
        )
        .addSubcommand(sub =>
            sub.setName('map_dj')
                .setDescription('Map a role to the DJ permission level.')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The role to grant DJ access to')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('unmap_dj')
                .setDescription('Remove a mapped role from DJ access.')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The role to remove')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(0),
    permissionLevel: PermissionLevel.GUILD_ADMIN,
    execute: async (interaction: ChatInputCommandInteraction, client: MeloraClient) => {
        const guildId = interaction.guildId!;
        const settings = await client.settings.getSettings(guildId);
        const sub = interaction.options.getSubcommand();

        let roleMappings = settings.roleMappings || {};
        let responseMessage = '';

        if (sub === 'view') {
            const djRoles = roleMappings['dj'] || [];
            if (djRoles.length > 0) {
                const formatted = djRoles.map(id => `<@&${id}>`).join(', ');
                responseMessage = `**Role Mappings**\n**DJ Roles:** ${formatted}`;
            } else {
                responseMessage = `**Role Mappings**\n**DJ Roles:** None mapped.`;
            }
        } else if (sub === 'map_dj') {
            const role = interaction.options.getRole('role')!;
            const djRoles = roleMappings['dj'] || [];

            if (djRoles.includes(role.id)) {
                responseMessage = `Role ${role.name} is already mapped to DJ.`;
            } else {
                djRoles.push(role.id);
                roleMappings['dj'] = djRoles;
                await client.settings.updateSetting(guildId, 'roleMappings', roleMappings);
                responseMessage = `Role <@&${role.id}> is now mapped to **DJ** level.`;
            }
        } else if (sub === 'unmap_dj') {
            const role = interaction.options.getRole('role')!;
            const djRoles = roleMappings['dj'] || [];

            if (!djRoles.includes(role.id)) {
                responseMessage = `Role ${role.name} is not mapped to DJ.`;
            } else {
                roleMappings['dj'] = djRoles.filter(id => id !== role.id);
                await client.settings.updateSetting(guildId, 'roleMappings', roleMappings);
                responseMessage = `Role <@&${role.id}> removed from **DJ** mappings.`;
            }
        }

        await interaction.reply(responseMessage);
    }
};
