import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show your recently played tracks in this server.'),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
            return;
        }

        const entries = await client.playHistory.getUserHistory(interaction.user.id, interaction.guildId, 10);
        if (entries.length === 0) {
            await interaction.reply({ content: 'Your listening history in this server is empty.', flags: MessageFlags.Ephemeral });
            return;
        }

        const lines = entries.map((entry, index) => {
            const title = Validators.truncate(entry.trackTitle.replace(/[`*_~|]/g, '\\$&'), 65);
            const author = Validators.truncate(entry.trackAuthor.replace(/[`*_~|]/g, '\\$&'), 35);
            return `**${index + 1}.** [${title}](${entry.trackUri}) — ${author} · <t:${Math.floor(entry.timestamp / 1000)}:R>`;
        });
        await interaction.reply({
            content: `**Recent listening history**\n${lines.join('\n')}`,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    },
};

export default command;
