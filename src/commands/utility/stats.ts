import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show your tracked listening stats in this server.'),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
            return;
        }

        const entries = await client.playHistory.getUserHistory(interaction.user.id, interaction.guildId, 10000);
        if (entries.length === 0) {
            await interaction.reply({ content: 'There are no tracked plays for you in this server yet.', flags: MessageFlags.Ephemeral });
            return;
        }

        const runtime = entries.reduce((sum, entry) => sum + Math.max(0, entry.duration), 0);
        const safe = (text: string) => Validators.truncate(text.replace(/[`*_~|]/g, '\\$&'), 70);
        const mostRecent = entries[0]!;

        await interaction.reply({
            content: [
                `**${interaction.user.username}'s listening stats**`,
                `Distinct tracks in retained history: **${entries.length}**`,
                `Combined track runtime: **${Validators.formatDuration(runtime)}**`,
                `Most recent: **${safe(mostRecent.trackTitle)}** — ${safe(mostRecent.trackAuthor)}`,
                '-# Runtime sums full track lengths; it is not measured listening time.',
            ].join('\n'),
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    },
};

export default command;
