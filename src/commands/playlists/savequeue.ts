import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('savequeue')
        .setDescription("Preserve the active path as a collection.")
        .addStringOption((opt) =>
            opt.setName('name')
                .setDescription("The designation to apply.")
                .setRequired(true)
                .setAutocomplete(true)
        ),
    permissionLevel: PermissionLevel.USER,
    cooldown: 10,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying],

    async autocomplete(interaction, client) {
        // Show the user's existing playlists to save over / update
        const playlists = await client.playlists.getUserPlaylists(interaction.user.id);
        const focused = interaction.options.getFocused().toLowerCase();

        let filtered = playlists;
        if (focused) {
            filtered = playlists.filter(p => p.name.toLowerCase().includes(focused));
        }

        await interaction.respond(
            filtered.slice(0, 25).map(p => ({
                name: `${p.name} (${p.tracks.length} tracks)`,
                value: p.name
            }))
        );
    },

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const session = client.music.getSession(interaction.guildId!);
        if (!session) return; // Handled by middleware

        const name = interaction.options.getString('name', true).trim();
        const userId = interaction.user.id;

        // Collect all tracks (Currently playing + queue)
        const allTracks = [];
        if (session.queue.current) allTracks.push(session.queue.current);
        allTracks.push(...session.queue.getAll());

        if (allTracks.length === 0) {
            await interaction.reply({ content: 'The queue is empty.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if playlist exists
            let playlist = await client.playlists.get(userId, name);
            if (!playlist) {
                // Auto create it
                await client.playlists.create(userId, name);
                playlist = await client.playlists.get(userId, name);
            }

            if (!playlist) {
                await interaction.editReply('Failed to initialize playlist.');
                return;
            }

            // Limit to 100 tracks to prevent database abuse
            const MAX_PLAYLIST_SIZE = 100;
            const availableSpace = MAX_PLAYLIST_SIZE - playlist.tracks.length;

            if (availableSpace <= 0) {
                await interaction.editReply(`Your playlist **${name}** is already full (${MAX_PLAYLIST_SIZE} tracks max).`);
                return;
            }

            const truncatedTracks = allTracks.slice(0, availableSpace);
            await client.playlists.addTracks(userId, name, truncatedTracks);

            let msg = `Saved **${truncatedTracks.length}** tracks to **${name}**.`;
            if (truncatedTracks.length < allTracks.length) {
                msg += ` *(Skipped ${allTracks.length - truncatedTracks.length} tracks to respect the ${MAX_PLAYLIST_SIZE} limit)*.`;
            }

            await interaction.editReply(msg);
        } catch (e) {
            await interaction.editReply(`Failed to save queue: ${(e as Error).message}`);
        }
    },
};

export default command;
