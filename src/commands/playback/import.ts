import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('import')
        .setDescription('Load a list of tracks')
        .addStringOption(opt => opt.setName('list').setDescription("Observe your forged collections.").setRequired(true)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 10,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        await interaction.deferReply();
        const list = interaction.options.getString('list', true);
        const queries = list.split(/\r?\n/).filter(q => q.trim().length > 0).slice(0, 20); // Limit to 20 lines

        if (queries.length === 0) {
            await interaction.editReply('Please provide a list of songs separated by newlines.');
            return;
        }

        const member = interaction.member as GuildMember;
        const vc = member?.voice?.channel;

        if (!vc) {
            await interaction.editReply('You must be in a voice channel.');
            return;
        }

        let session = client.music.getSession(interaction.guildId!);

        if (!session) {
            session = await client.music.createSession(interaction.guildId!, vc, interaction.channel!);
        }

        let addedCount = 0;
        const failed: string[] = [];

        await interaction.editReply(`Processing **${queries.length}** items...`);

        for (const query of queries) {
            try {
                const searchResult = await client.music.search(query, interaction.user);
                if (searchResult.tracks.length > 0) {
                    const track = searchResult.tracks[0];
                    track.requester = { id: interaction.user.id, username: interaction.user.username };
                    session.queue.add(track);
                    addedCount++;
                } else {
                    failed.push(query);
                }
            } catch {
                failed.push(query);
            }
        }

        if (!session.isPlaying) {
            void session.play();
        }

        let msg = `Added **${addedCount}** tracks to the queue.`;
        if (failed.length > 0) {
            msg += `\n${failed.length} could not be resolved.`;
        }

        await interaction.editReply(msg);
    },
};

export default command;
