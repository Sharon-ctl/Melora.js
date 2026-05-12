import type { CommandContext } from './CommandContext.js';
import { QueuePanel } from '../components/QueuePanel.js';
import { LoopMode } from '../types/index.js';

export class QueueController {
    static async queue(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        const tracks = session?.queue.getAll() ?? [];
        const current = session?.queue.current ?? null;
        await QueuePanel.send(context, tracks, current);
    }

    static async shuffle(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || (!session.isPlaying && session.queue.size === 0)) {
            await context.reply('Nothing is playing.');
            return;
        }
        session.queue.smartShuffle();
        await context.tempReply('Queue shuffled.');
    }

    static async loop(context: CommandContext, modeInput: string): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session) {
            await context.reply('Nothing is playing.');
            return;
        }

        let mode = LoopMode.OFF;
        const lowerMode = modeInput.toLowerCase();
        
        if (['track', 'song', 'single'].includes(lowerMode)) {
            mode = LoopMode.TRACK;
        } else if (['queue', 'all'].includes(lowerMode)) {
            mode = LoopMode.QUEUE;
        } else if (['autoplay', 'auto'].includes(lowerMode)) {
            mode = LoopMode.AUTOPLAY;
        } else if (['off', 'none'].includes(lowerMode)) {
            mode = LoopMode.OFF;
        } else {
            await context.reply('Invalid mode. Choose: `track`, `queue`, `autoplay`, `off`.');
            return;
        }

        await session.setLoopMode(mode);

        const modeName = mode === LoopMode.OFF ? 'Off' :
            mode === LoopMode.TRACK ? 'Track' :
            mode === LoopMode.QUEUE ? 'Queue' : 'Autoplay';

        await context.tempReply(`Loop mode set to **${modeName}**.`);
    }

    static async remove(context: CommandContext, position: number, count: number = 1): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || session.queue.isEmpty) {
            await context.reply('Queue is empty.', true);
            return;
        }

        if (isNaN(position) || position < 1 || position > session.queue.size) {
            await context.reply(`Provide a valid position between 1 and ${session.queue.size}.`);
            return;
        }

        const pos = position - 1;

        if (count > 1) {
            const end = Math.min(session.queue.size - 1, pos + count - 1);
            const removed = session.queue.removeRange(pos, end);
            if (removed.length === 0) {
                await context.reply('Invalid range.', true);
                return;
            }
            await context.tempReply(`Removed **${removed.length}** tracks from the queue.`);
        } else {
            const removed = session.queue.remove(pos);
            if (!removed) {
                await context.reply('Invalid position.', true);
                return;
            }
            await context.tempReply(`Removed **${removed.title}** from the queue.`);
        }
    }

    static async clear(context: CommandContext, userId?: string | null): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || session.queue.isEmpty) {
            await context.reply('The queue is already empty.', true);
            return;
        }

        if (userId) {
            const user = await context.client.users.fetch(userId).catch(() => null);
            const username = user ? user.username : 'user';
            const removed = session.queue.removeByUser(userId);
            if (removed === 0) {
                await context.reply(`No tracks by **${username}** found.`, true);
            } else {
                await context.tempReply(`Cleared **${removed}** tracks by **${username}**.`);
            }
        } else {
            const count = session.queue.size;
            session.queue.clear();
            await context.tempReply(`Cleared **${count}** tracks from the queue.`);
        }
    }

    static async move(context: CommandContext, from: number, to: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || session.queue.isEmpty) {
            await context.reply('The queue is empty.', true);
            return;
        }
        if (from < 1 || to < 1 || from > session.queue.size || to > session.queue.size) {
            await context.reply(`Invalid range. Queue size is ${session.queue.size}.`, true);
            return;
        }
        const success = session.queue.move(from - 1, to - 1);
        if (success) {
            await context.tempReply(`Moved track from **${from}** to **${to}**.`);
            await session.nowPlayingPanel?.update();
        } else {
            await context.reply('Could not move the track.', true);
        }
    }

    static async jump(context: CommandContext, position: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || session.queue.isEmpty) {
            await context.reply('Queue is empty.', true);
            return;
        }
        if (isNaN(position) || position < 1 || position > session.queue.size) {
            await context.reply(`Invalid position. Queue size is ${session.queue.size}.`, true);
            return;
        }

        const target = session.queue.jump(position - 1);
        if (!target) {
            await context.reply('Invalid position.', true);
            return;
        }

        if (session.player) {
            if (target.unresolved) {
                const resolved = await context.client.music.resolveTrack(target);
                if (resolved.encoded) {
                    target.encoded = resolved.encoded;
                    target.duration = resolved.duration;
                } else {
                    await context.reply(`Could not resolve **${target.title}**.`);
                    return;
                }
            }
            if (target.encoded) {
                await session.player.play(target.encoded);
                await context.tempReply(`Jumped to **${target.title}**.`);
            }
        }
    }

    static async swap(context: CommandContext, pos1: number, pos2: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || session.queue.isEmpty) {
            await context.reply('Queue is empty.', true);
            return;
        }

        const a = pos1 - 1;
        const b = pos2 - 1;
        const success = session.queue.swap(a, b);

        if (!success) {
            await context.reply('Invalid positions.', true);
            return;
        }
        await context.tempReply(`Swapped positions **${pos1}** and **${pos2}**.`);
    }
}
