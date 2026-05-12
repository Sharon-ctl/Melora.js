import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    MessageFlags,

    type GuildMember,
} from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('playfile')
        .setDescription("Introduce a physical sound into the flow.")
        .addAttachmentOption((opt) =>
            opt.setName('file').setDescription('Audio file to play').setRequired(true)
        ),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,
    middleware: [
        SafetyChecks.requireVoiceChannel,
        SafetyChecks.requireBotPermissions,
        SafetyChecks.requireRestricted,
        SafetyChecks.requireVoiceCapacity
    ],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const attachment = interaction.options.getAttachment('file', true);
        const member = interaction.member as GuildMember;

        // Basic mime-type validation to prevent uploading random garbage
        if (!attachment.contentType?.startsWith('audio/') && !attachment.contentType?.startsWith('video/')) {
            await interaction.reply({
                content: `Bruh that ain't an audio file. I see \`${attachment.contentType || 'unknown'}\``,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferReply();

        // Search the direct URL via Lavalink
        const searchResult = await client.music.search(attachment.url, interaction.user);
        const results = searchResult.tracks;

        if (results.length === 0) {
            await interaction.editReply({ content: `Failed to resolve the audio from: **${attachment.name}**` });
            return;
        }

        const track = results[0]!;
        track.requester = { id: member.id, username: member.user.username };
        // Override title to the filename so it looks nicer in the queue than a random Discord CDN url
        track.title = attachment.name;

        if (!await SafetyChecks.requireDuration(interaction, client, track.duration)) return;

        // Check queue limits
        const settings = await client.settings.getSettings(interaction.guildId!);
        let session = client.music.getSession(interaction.guildId!);
        const currentSize = session ? session.queue.size : 0;

        if (currentSize >= settings.maxQueueSize) {
            await interaction.followUp({
                content: `Queue full. Could not add track.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Session creation
        if (!session) {
            try {
                session = await client.music.createSession(
                    interaction.guildId!,
                    member?.voice?.channel!,
                    interaction.channel!,
                );
            } catch (error) {
                await interaction.editReply({ content: `**Damn connection failed**: ${(error as Error).message}` });
                return;
            }
        }

        const isFirstTrack = !session.isPlaying;
        session.queue.add(track);

        await interaction.editReply('Added: **' + track.title + '** `' + Validators.formatDuration(track.duration) + '`');

        // Background Playback Logic for first track
        if (isFirstTrack) {
            void session.play();
        }
    },
};

export default command;
