import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    MessageFlags,
    type GuildMember,
} from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('favorites')
        .setDescription('Manage your favorite tracks.')
        .addSubcommand(sub =>
            sub.setName('list').setDescription('View your favorite tracks.')
        )
        .addSubcommand(sub =>
            sub.setName('play').setDescription('Play all your favorites.')
                .addBooleanOption(opt =>
                    opt.setName('shuffle').setDescription('Shuffle the favorites before playing.').setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove a track from favorites.')
                .addIntegerOption(opt =>
                    opt.setName('position').setDescription('Position of the track to remove.').setRequired(true).setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('clear').setDescription('Clear all your favorites.')
        ),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const sub = interaction.options.getSubcommand(true);

        switch (sub) {
            case 'list': {
                const data = await client.favorites.get(interaction.user.id);
                if (data.tracks.length === 0) {
                    await interaction.reply({
                        content: 'You have no favorites yet. Use the ❤️ button on the Now Playing panel to add tracks!',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const lines = data.tracks.slice(0, 25).map((t, i) =>
                    `\`${i + 1}.\` [${Validators.truncate(t.title, 40)}](${t.uri}) — ${Validators.truncate(t.author, 25)}`
                );

                const totalDuration = data.tracks.reduce((sum, t) => sum + t.duration, 0);

                const linesStr = lines.join('\n');
                const content = `**❤️ ${interaction.user.username}'s Favorites**\n\n${linesStr}\n\n-# ${data.tracks.length} tracks • Total: ${Validators.formatDuration(totalDuration)}`;

                await interaction.reply({
                    content,
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case 'play': {
                const member = interaction.member as GuildMember;
                const vc = member?.voice?.channel;
                if (!vc) {
                    await interaction.reply({ content: 'You must be in a voice channel.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const data = await client.favorites.get(interaction.user.id);
                if (data.tracks.length === 0) {
                    await interaction.reply({ content: 'You have no favorites to play!', flags: MessageFlags.Ephemeral });
                    return;
                }

                await interaction.deferReply();

                const shouldShuffle = interaction.options.getBoolean('shuffle') ?? false;

                let session = client.music.getSession(interaction.guildId!);
                if (!session) {
                    session = await client.music.createSession(interaction.guildId!, vc, interaction.channel!);
                }

                // Prepare tracks
                let tracks = [...data.tracks]
                    .map(t => ({ ...t, requester: { id: interaction.user.id, username: interaction.user.username } }));

                if (shouldShuffle) {
                    tracks = tracks.sort(() => Math.random() - 0.5);
                }

                // Respect queue limits
                const settings = await client.settings.getSettings(interaction.guildId!);
                const available = settings.maxQueueSize - session.queue.size;
                const toAdd = tracks.slice(0, Math.max(0, available));

                if (toAdd.length === 0) {
                    await interaction.editReply('Queue is full, can\'t add favorites.');
                    return;
                }

                const isFirstTrack = !session.isPlaying;
                session.queue.addMany(toAdd);

                // Build embed like play commands
                const shuffleLabel = shouldShuffle ? ' (Shuffled)' : '';
                await interaction.editReply('Added: **Favorites' + shuffleLabel + '** `' + toAdd.length + ' tracks`');

                if (isFirstTrack) {
                    void session.play();
                }
                break;
            }

            case 'remove': {
                const position = interaction.options.getInteger('position', true);
                const data = await client.favorites.get(interaction.user.id);

                if (position < 1 || position > data.tracks.length) {
                    await interaction.reply({ content: `Invalid position. You have ${data.tracks.length} favorites.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const removed = data.tracks[position - 1]!;
                await client.favorites.remove(interaction.user.id, removed.uri);
                await interaction.reply({ content: `Removed **${removed.title}** from favorites.`, flags: MessageFlags.Ephemeral });
                break;
            }

            case 'clear': {
                const count = await client.favorites.clear(interaction.user.id);
                await interaction.reply({
                    content: count > 0 ? `Cleared **${count}** favorites.` : 'You had no favorites to clear.',
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }
        }
    },
};

export default command;
