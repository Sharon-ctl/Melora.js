import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { LoopMode, PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription("Allow the stream to guide itself.")
        .setDMPermission(false),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 5,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const session = client.music.getSession(interaction.guildId!);

        if (!session || !session.voiceChannel) {
            await interaction.reply({ content: 'Join a voice channel first.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Toggle logic
        if (session.queue.loopMode === LoopMode.AUTOPLAY) {
            session.queue.loopMode = LoopMode.OFF;
            await interaction.reply({ content: 'Autoplay **disabled**.' });
        } else {
            session.queue.loopMode = LoopMode.AUTOPLAY;
            await interaction.reply({ content: 'Autoplay **enabled**.' });

            // If queue is empty (except current song), try triggering autoplay immediately if near end? 
            // Usually Autoplay triggers onTrackEnd.
            // If nothing is playing, maybe we should start? But queue is empty.
            // If something is playing, it will trigger next.
        }

        // Update UI
        if (session.nowPlayingPanel) {
            await session.nowPlayingPanel.update();
        }
    },
};

export default command;
