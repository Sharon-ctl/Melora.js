import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('diagnose')
        .setDescription('Check music playback and show likely fixes.'),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
            return;
        }

        const ready = client.isReady();
        const session = client.music.getSession(guild.id);
        const audioReady = [...client.shoukaku.nodes.values()].some((node) => node.state === 2);
        const voiceReady = Boolean(guild.members.me?.voice.channelId);
        const current = session?.queue.current ?? null;
        const queued = session?.queue.size ?? 0;
        const playback = current ? (session?.player?.paused ? 'PAUSED' : 'PLAYING') : 'IDLE';

        let finding: string;
        let code: string;
        let nextStep: string;
        if (!ready) {
            code = 'GATEWAY_OFFLINE';
            finding = 'The bot is not connected to Discord.';
            nextStep = 'Check the bot process and Discord connection, then retry.';
        } else if (!audioReady) {
            code = 'AUDIO_BACKEND_UNAVAILABLE';
            finding = 'No Lavalink node is available.';
            nextStep = 'Check the Lavalink service, node address, and password; retry /play when the node is online.';
        } else if (session && !voiceReady) {
            code = 'VOICE_DISCONNECTED';
            finding = 'The player exists, but Discord voice is disconnected.';
            nextStep = 'Run /play from your voice channel to reconnect.';
        } else if (!current && queued > 0) {
            code = 'QUEUE_STALLED';
            finding = 'Tracks are queued, but none is playing.';
            nextStep = 'Try /play with a new track; if playback remains idle, share this report with an administrator.';
        } else if (playback === 'PAUSED') {
            code = 'PLAYBACK_PAUSED';
            finding = 'Playback is paused.';
            nextStep = 'Run /resume to continue.';
        } else if (!session) {
            code = 'NO_ACTIVE_SESSION';
            finding = 'No music session is active in this server.';
            nextStep = 'Join a voice channel and run /play.';
        } else {
            code = 'HEALTHY';
            finding = 'The gateway, audio backend, and player state look healthy.';
            nextStep = 'If you still hear silence, check your voice channel permissions and bitrate.';
        }

        const report = [
            '### Music Bot Diagnostics',
            `**Discord gateway:** \`${ready ? 'READY' : 'NOT READY'}\``,
            `**Audio backend:** \`${audioReady ? 'READY' : client.shoukaku.nodes.size ? 'UNAVAILABLE' : 'NOT CONFIGURED'}\``,
            `**Voice connection:** \`${voiceReady ? 'CONNECTED' : 'NOT CONNECTED'}\``,
            `**Playback:** \`${playback}\``,
            `**Queue:** \`${queued} tracks\``,
            `**Finding:** ${finding}`,
            `**Code:** \`${code}\``,
            `**Next step:** ${nextStep}`,
        ].join('\n');

        await interaction.reply({ content: report, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    },
};

export default command;
