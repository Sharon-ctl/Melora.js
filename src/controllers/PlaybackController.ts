import type { User } from 'discord.js';
import type { CommandContext } from './CommandContext.js';
import { Validators } from '../utils/Validators.js';
import type { TrackInfo } from '../types/index.js';

export class PlaybackController {

    static async play(context: CommandContext, query: string, dedicateUser?: User | null, dedicateNote?: string | null): Promise<void> {
        const { client, guild, member, user } = context;

        await context.deferReply();

        const searchResult = await client.music.search(query, user);
        const results = searchResult.tracks;

        if (results.length === 0) {
            await context.editReply(`Bruh i found nothing for: **${query}**`);
            return;
        }

        let tracksToAdd: TrackInfo[] = [];

        if (searchResult.type === 'search') {
            tracksToAdd = [results[0]!];
        } else {
            tracksToAdd = results;
        }

        const track = tracksToAdd[0]!;
        tracksToAdd.forEach(t => {
            t.requester = { id: user.id, username: user.username };
            if (dedicateUser) t.dedicateTo = { id: dedicateUser.id, username: dedicateUser.username };
            if (dedicateNote) t.dedicateNote = dedicateNote;
        });

        // Use a dummy interaction for SafetyChecks if from prefix?
        // Wait, SafetyChecks.requireDuration currently uses ChatInputCommandInteraction. We can manually check duration if it's prefix, or update SafetyChecks.
        // Let's do it directly here to ensure compatibility if it's prefix.
        const settings = await client.settings.getSettings(guild.id);
        if (settings.maxDuration && track.duration > settings.maxDuration * 1000) {
            await context.editReply(`Track is too long (Max: ${settings.maxDuration}s)`);
            return;
        }

        let session = client.music.getSession(guild.id);
        const currentSize = session ? session.queue.size : 0;
        const availableSpace = settings.maxQueueSize - currentSize;

        if (availableSpace <= 0) {
            if (!context.isPrefix) await context.editReply(`Queue full. Could not add **${tracksToAdd.length}** tracks.`);
            return;
        }

        if (tracksToAdd.length > availableSpace) {
            tracksToAdd = tracksToAdd.slice(0, availableSpace);
            await context.tempReply(`QUEUE LIMIT: Added only the first **${availableSpace}** tracks.`);
        }

        if (!session) {
            if (!member.voice?.channel) {
                await context.editReply('Join a voice channel first.');
                return;
            }
            try {
                session = await client.music.createSession(guild.id, member.voice.channel, context.channel);
            } catch (error) {
                await context.editReply(`**Damn connection failed**: ${(error as Error).message}`);
                return;
            }
        }

        const isFirstTrack = !session.isPlaying;
        const isPlaylist = searchResult.type === 'playlist' || (tracksToAdd.length > 1 && searchResult.type !== 'search');
        const playlistName = searchResult.playlistName || tracksToAdd[0].playlistName || 'Playlist';

        session.queue.addMany(tracksToAdd);

        let responseMessage = '';
        if (isPlaylist) {
            responseMessage = 'Added: **' + playlistName + '** `' + tracksToAdd.length + ' tracks`';
        } else {
            const t = tracksToAdd[0]!;
            responseMessage = 'Added: **' + t.title + '** `' + Validators.formatDuration(t.duration) + '`';
            if (dedicateUser) {
                responseMessage += '\n*Dedicated to <@' + dedicateUser.id + '>' + (dedicateNote ? ': ' + dedicateNote : '') + '*';
            }
        }

        if (context.isPrefix) {
            await context.tempReply(responseMessage, 10000);
        } else {
            await context.editReply(responseMessage);
        }

        if (isFirstTrack) {
            void session.play();
        }
    }

    static async skip(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || (!session.isPlaying && session.queue.size === 0)) {
            await context.reply('Nothing is playing.');
            return;
        }

        const isDj = context.interaction ? await context.client.permissions.isDj(context.interaction) : await context.client.permissions.isDJ(context.member);

        if (isDj) {
            await session.skipCurrent();
            await context.tempReply('Skipped.');
            return;
        }

        const votes = session.addVoteSkip(context.user.id);
        const threshold = session.getVoteThreshold();

        if (votes >= threshold) {
            const current = session.queue.current;
            session.clearVoteSkips();
            await session.skipCurrent();
            await context.tempReply(`Vote skip passed — skipped **${current?.title ?? 'track'}**.`);
        } else {
            await context.tempReply(`Vote skip — **${votes}**/**${threshold}** votes.`);
        }
    }

    static async pause(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        await session.pause();
        await context.tempReply('Paused.');
    }

    static async resume(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        await session.resume();
        await context.tempReply('Resumed.');
    }

    static async stop(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session) {
            await context.reply('Nothing is playing.');
            return;
        }
        await session.stop();
        await context.tempReply('Stopped playback and cleared the queue.');
    }

    static async join(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (session) {
            await context.reply('I am already in a voice channel.');
            return;
        }
        if (!context.member.voice?.channel) {
            await context.reply('Join a voice channel first.');
            return;
        }
        await context.client.music.createSession(context.guild.id, context.member.voice.channel, context.channel);
        await context.tempReply(`Joined <#${context.member.voice.channel.id}>`);
    }

    static async leave(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session) {
            await context.reply('I am not in a voice channel.');
            return;
        }
        await session.destroy();
        await context.tempReply('Disconnected.');
    }

    static async nowplaying(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying || !session.queue.current) {
            await context.reply('Nothing is currently playing.');
            return;
        }
        
        if (session.nowPlayingPanel) {
            await session.resendNowPlayingPanel(context.channel);
            if (context.isPrefix) await context.message?.react('✅');
            else await context.reply('Panel updated.', true);
        } else {
            await context.reply('No active panel.');
        }
    }

    static async volume(context: CommandContext, vol: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session) {
            await context.reply('Nothing is playing.');
            return;
        }
        if (isNaN(vol) || vol < 0 || vol > 200) {
            await context.reply('Provide a volume between 0 and 200.');
            return;
        }

        const settings = await context.client.settings.getSettings(context.guild.id);
        if (vol > settings.volumeLimit) {
            await context.reply(`Volume is capped at **${settings.volumeLimit}%** in this server.`, true);
            return;
        }

        if (session.player) {
            await session.player.setVolume(vol);
        }
        await context.tempReply(`Volume: **${vol}%**`);
    }

    static async seek(context: CommandContext, positionStr: string): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }

        const seconds = Validators.parseDuration(positionStr);
        if (seconds === null) {
            await context.reply('Invalid format — use `m:ss` (e.g. `1:30`).', true);
            return;
        }

        const posMs = seconds * 1000;
        const current = session.queue.current;
        if (current && posMs > current.duration) {
            await context.reply('Position exceeds track duration.', true);
            return;
        }

        await session.player?.seek(posMs);
        await context.tempReply(`Seeked to **${Validators.formatDuration(posMs)}**.`);
    }

    static async replay(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        await session.player?.seek(0);
        const title = session.queue.current?.title ?? 'track';
        await context.tempReply(`Replaying **${title}**.`);
    }

    static async forward(context: CommandContext, seconds: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        if (isNaN(seconds) || seconds < 1) {
            await context.reply('Provide a valid number of seconds.', true);
            return;
        }

        const forwardMs = seconds * 1000;
        const currentPos = session.player?.position || 0;
        const duration = session.queue.current?.duration || 0;
        let newPos = currentPos + forwardMs;
        if (newPos > duration) newPos = duration;

        await session.player?.seek(newPos);
        await context.tempReply(`Forwarded to **${Validators.formatDuration(newPos)}**.`);
    }

    static async rewind(context: CommandContext, seconds: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        if (isNaN(seconds) || seconds < 1) {
            await context.reply('Provide a valid number of seconds.', true);
            return;
        }

        const rewindMs = seconds * 1000;
        const currentPos = session.player?.position || 0;
        let newPos = currentPos - rewindMs;
        if (newPos < 0) newPos = 0;

        await session.player?.seek(newPos);
        await context.tempReply(`Rewound to **${Validators.formatDuration(newPos)}**.`);
    }

    static async previous(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || session.queue.getHistory().length === 0) {
            await context.reply('No previous tracks.', true);
            return;
        }

        const previousTrack = session.queue.getHistory()[0];
        await session.playPrevious();
        await context.tempReply(`Playing previous — **${previousTrack?.title}**.`);
    }
}
