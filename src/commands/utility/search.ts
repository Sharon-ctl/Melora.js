import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Find tracks without immediately adding them to the queue.')
        .addStringOption(option => option.setName('query').setDescription('Track title, artist, or URL').setRequired(true).setMinLength(1).setMaxLength(200)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 4,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const query = interaction.options.getString('query', true).trim();
        if (!interaction.guildId || !query) {
            await interaction.reply({ content: 'Enter a search term in a server.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const result = await client.music.search(query, interaction.user);
            const tracks = result.tracks.slice(0, 5);
            if (tracks.length === 0) {
                await interaction.editReply('No tracks found. Try a different title, artist, or link.');
                return;
            }

            const lines = tracks.map((track, index) => {
                const title = Validators.truncate(track.title.replace(/[\[\]()`*_~|]/g, '\\$&'), 70);
                const author = Validators.truncate(track.author.replace(/[\[\]()`*_~|]/g, '\\$&'), 35);
                return `**${index + 1}.** [${title}](${track.uri}) — ${author} · ${Validators.formatDuration(track.duration)}`;
            });
            const safeQuery = Validators.truncate(query.replace(/[`*_~|]/g, '\\$&'), 100);
            await interaction.editReply({ content: `**Search results for “${safeQuery}”**\n${lines.join('\n')}` });
        } catch {
            await interaction.editReply('Search is temporarily unavailable. Please try again shortly.');
        }
    },
};

export default command;
