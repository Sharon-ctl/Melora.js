import { SlashCommandBuilder, type GuildMember, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand, TrackInfo } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('insert')
        .setDescription("Insert a track at the top of the queue.")
        .addStringOption((opt) => opt.setName('query').setDescription("The essence to seek.").setRequired(true).setAutocomplete(true))
        .addUserOption((opt) => opt.setName('dedicate_to').setDescription("Assign this sound to a soul.").setRequired(false))
        .addStringOption((opt) => opt.setName('dedicate_note').setDescription("A message to carry with the sound.").setRequired(false)),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireBotPermissions, SafetyChecks.requireSameChannel, SafetyChecks.requireRestricted, SafetyChecks.requireVoiceCapacity],

    async autocomplete(interaction, client) {
        const focused = interaction.options.getFocused();

        if (!focused) {
            if (!interaction.guildId) return;
            const seen = new Set<string>();
            const items: { name: string; value: string }[] = [];

            const session = client.music.getSession(interaction.guildId);
            if (session) {
                const current = session.queue.current;
                if (current) {
                    seen.add(current.title);
                    items.push({
                        name: '\u{1F3B5} ' + Validators.truncate(current.title, 50),
                        value: Validators.truncate(current.title, 100)
                    });
                }

                for (const entry of session.queue.getHistory()) {
                    if (seen.has(entry.title)) continue;
                    seen.add(entry.title);
                    items.push({
                        name: '\u{1F55B} ' + Validators.truncate(entry.title, 50),
                        value: Validators.truncate(entry.title, 100)
                    });
                    if (items.length >= 25) break;
                }
            }

            if (items.length < 25) {
                const globalHistory = await client.playHistory.getGlobalHistory(25);
                for (const entry of globalHistory) {
                    if (seen.has(entry.trackTitle)) continue;
                    seen.add(entry.trackTitle);
                    items.push({
                        name: '\u{1F55B} ' + Validators.truncate(entry.trackTitle, 50),
                        value: Validators.truncate(entry.trackTitle, 100)
                    });
                    if (items.length >= 25) break;
                }
            }

            if (items.length === 0) {
                await interaction.respond([{ name: '\u2728 Type to search for a song...', value: 'placeholder' }]);
            } else {
                await interaction.respond(items.slice(0, 25));
            }
        } else {
            // Typed input: Search via Lavalink ytsearch
            if (focused.length > 2) {
                try {
                    const node = client.shoukaku.options.nodeResolver(client.shoukaku.nodes);
                    if (node) {
                        const result = await node.rest.resolve(`ytsearch:${focused}`);
                        if (result && result.loadType === 'search') {
                            const tracks = result.data.slice(0, 10);
                            await interaction.respond(
                                tracks.map((t: any) => ({
                                    name: '\u{1F50E} ' + Validators.truncate(t.info.title, 50),
                                    value: Validators.truncate(t.info.uri, 100)
                                }))
                            );
                            return;
                        }
                    }
                    await interaction.respond([]);
                } catch {
                    await interaction.respond([]);
                }
            } else {
                await interaction.respond([]);
            }
        }
    },

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const query = interaction.options.getString('query', true);
        const dedicateUser = interaction.options.getUser('dedicate_to');
        const dedicateNote = interaction.options.getString('dedicate_note');
        const member = interaction.member as GuildMember;
        await interaction.deferReply();

        const searchResult = await client.music.search(query, interaction.user);
        const results = searchResult.tracks;

        if (results.length === 0) {
            await interaction.editReply({ content: 'I couldn\'t find that.' });
            return;
        }

        let tracksToAdd: TrackInfo[] = [];

        if (searchResult.type === 'search') {
            tracksToAdd = [results[0]!];
        } else {
            tracksToAdd = results;
        }

        let session = client.music.getSession(interaction.guildId!);

        const track = tracksToAdd[0]!;
        tracksToAdd.forEach(t => {
            t.requester = { id: member.id, username: member.user.username };
            if (dedicateUser) t.dedicateTo = { id: dedicateUser.id, username: dedicateUser.username };
            if (dedicateNote) t.dedicateNote = dedicateNote;
        });

        if (!await SafetyChecks.requireDuration(interaction, client, track.duration)) return;
        if (!await SafetyChecks.requireQueueSpace(interaction, client, tracksToAdd.length)) return;

        let responseMessage = '';
        if (tracksToAdd.length > 1) {
            responseMessage = 'Inserted: **' + (track.playlistName || 'Playlist') + '** `' + tracksToAdd.length + ' tracks`';
        } else {
            responseMessage = 'Inserted: **' + track.title + '** `' + Validators.formatDuration(track.duration) + '`';
            if (dedicateUser) {
                responseMessage += '\n*Dedicated to <@' + dedicateUser.id + '>' + (dedicateNote ? ': ' + dedicateNote : '') + '*';
            }
        }

        await interaction.editReply(responseMessage);

        session = client.music.getSession(interaction.guildId!);

        if (!session) {
            session = await client.music.createSession(interaction.guildId!, member?.voice?.channel!, interaction.channel!);
            session.queue.addMany(tracksToAdd);
        } else {
            for (let i = tracksToAdd.length - 1; i >= 0; i--) {
                session.queue.addTop(tracksToAdd[i]!);
            }
        }

        const currentSession = session!;
        if (!currentSession.isPlaying) {
            void currentSession.play();
        }
    },
};

export default command;
