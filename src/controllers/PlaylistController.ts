
import type { CommandContext } from './CommandContext.js';
import { Validators } from '../utils/Validators.js';

export class PlaylistController {

    static async create(context: CommandContext, name: string): Promise<void> {
        if (!name || name.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }

        await context.deferReply(true);
        try {
            const existing = await context.client.playlists.get(context.user.id, name.trim());
            if (existing) {
                await context.editReply(`Playlist **${name}** already exists.`);
                return;
            }
            await context.client.playlists.create(context.user.id, name.trim());
            await context.editReply(`Playlist **${name}** created.`);
        } catch (e) {
            await context.editReply(`Failed to create playlist: ${(e as Error).message}`);
        }
    }

    static async deletePlaylist(context: CommandContext, name: string): Promise<void> {
        if (!name || name.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }

        await context.deferReply(true);
        const success = await context.client.playlists.delete(context.user.id, name.trim());
        if (success) {
            await context.editReply(`Playlist **${name}** deleted.`);
        } else {
            await context.editReply(`Playlist **${name}** not found.`);
        }
    }

    static async list(context: CommandContext): Promise<void> {
        await context.deferReply();
        const playlists = await context.client.playlists.getUserPlaylists(context.user.id);
        if (playlists.length === 0) {
            await context.editReply('You have no playlists.');
            return;
        }

        const listStr = playlists.map(p => `• **${p.name}** (${p.tracks.length} tracks)`).join('\n');
        await context.editReply(`**Your Playlists**\n${listStr}`);
    }

    static async play(context: CommandContext, name: string): Promise<void> {
        if (!name || name.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }

        if (!context.member.voice?.channel) {
            await context.reply('Join a voice channel first.', true);
            return;
        }

        await context.deferReply();
        const playlist = await context.client.playlists.get(context.user.id, name.trim());
        if (!playlist) {
            await context.editReply(`Playlist **${name}** not found.`);
            return;
        }

        if (playlist.tracks.length === 0) {
            await context.editReply(`Playlist **${playlist.name}** is empty.`);
            return;
        }

        let session = context.client.music.getSession(context.guild.id);
        if (!session) {
            try {
                session = await context.client.music.createSession(
                    context.guild.id,
                    context.member.voice.channel,
                    context.channel
                );
            } catch (e) {
                await context.editReply(`Failed to join voice: ${(e as Error).message}`);
                return;
            }
        }

        const tracks = playlist.tracks.map(t => ({
            ...t,
            requester: { id: context.user.id, username: context.user.username }
        }));

        const isFirstTrack = !session.isPlaying;
        session.queue.addMany(tracks);

        const responseMessage = `Played playlist "**${playlist.name}**" (${tracks.length} tracks)`;

        if (context.isPrefix) {
            await context.tempReply(responseMessage, 10000);
        } else {
            await context.editReply(responseMessage);
        }

        if (isFirstTrack) {
            void session.play();
        }
    }

    static async add(context: CommandContext, playlistName: string, url?: string): Promise<void> {
        if (!playlistName || playlistName.trim().length === 0) {
            await context.reply('Provide a playlist name. Usage: `!pladd <name> [url]`', true);
            return;
        }

        await context.deferReply(true);

        let tracksToAdd: any[] = [];

        if (url) {
            try {
                const searchResult = await context.client.music.search(url, context.user);
                if (searchResult.tracks.length === 0) {
                    await context.editReply('No tracks found for that URL.');
                    return;
                }
                tracksToAdd = searchResult.tracks;
            } catch (e) {
                await context.editReply(`Failed to resolve URL: ${(e as Error).message}`);
                return;
            }
        } else {
            const session = context.client.music.getSession(context.guild.id);
            if (!session || !session.queue.current) {
                await context.editReply('Nothing is currently playing. Provide a URL or play a track first.');
                return;
            }
            tracksToAdd = [session.queue.current];
        }

        try {
            let playlist = await context.client.playlists.get(context.user.id, playlistName.trim());
            let createdNew = false;
            if (!playlist) {
                playlist = await context.client.playlists.create(context.user.id, playlistName.trim());
                createdNew = true;
            }

            let addedCount = 0;
            for (const track of tracksToAdd) {
                await context.client.playlists.addTrack(context.user.id, playlistName.trim(), track);
                addedCount++;
            }

            const trackTitle = tracksToAdd.length === 1 ? `**${Validators.truncate(tracksToAdd[0].title, 30)}**` : `${addedCount} tracks`;
            const action = createdNew ? `Created playlist **${playlistName}** and added` : `Added`;
            await context.editReply(`${action} ${trackTitle}.`);
        } catch (e) {
            await context.editReply(`Failed to update playlist: ${(e as Error).message}`);
        }
    }

    static async removeTrack(context: CommandContext, playlistName: string, index: number): Promise<void> {
        if (!playlistName || playlistName.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }
        if (isNaN(index) || index < 1) {
            await context.reply('Index must be at least 1.', true);
            return;
        }

        await context.deferReply(true);
        try {
            await context.client.playlists.removeTrack(context.user.id, playlistName.trim(), index - 1);
            await context.editReply(`Removed track #${index} from **${playlistName}**.`);
        } catch (e) {
            await context.editReply(`Failed to remove track: ${(e as Error).message}`);
        }
    }

    static async view(context: CommandContext, name: string): Promise<void> {
        if (!name || name.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }

        await context.deferReply();
        const playlist = await context.client.playlists.get(context.user.id, name.trim());
        if (!playlist) {
            await context.editReply(`Playlist **${name}** not found.`);
            return;
        }

        if (playlist.tracks.length === 0) {
            await context.editReply(`Playlist **${name}** is empty.`);
            return;
        }

        const tracksContent = playlist.tracks.slice(0, 10).map((t: any, i: number) =>
            `\`${i + 1}.\` ${Validators.truncate(t.title, 60)}`
        ).join('\n');

        const content = `**Playlist: ${playlist.name}** (${playlist.tracks.length} tracks)\n\n${tracksContent}` + (playlist.tracks.length > 10 ? `\n*...and ${playlist.tracks.length - 10} more*` : '');

        await context.editReply(content);
    }

    static async rename(context: CommandContext, oldName: string, newName: string): Promise<void> {
        if (!oldName || oldName.trim().length === 0 || !newName || newName.trim().length === 0) {
            await context.reply('Provide both old and new playlist names.', true);
            return;
        }

        await context.deferReply(true);
        try {
            await context.client.playlists.rename(context.user.id, oldName.trim(), newName.trim());
            await context.editReply(`Playlist renamed — **${oldName}** to **${newName}**.`);
        } catch (e) {
            await context.editReply(`Failed to rename playlist: ${(e as Error).message}`);
        }
    }

    static async share(context: CommandContext, name: string, targetUserId: string, targetUsername: string): Promise<void> {
        if (!name || name.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }
        if (!targetUserId) {
            await context.reply('Mention a user to share with.', true);
            return;
        }
        if (targetUserId === context.user.id) {
            await context.reply('You already own this playlist.', true);
            return;
        }

        await context.deferReply();
        try {
            await context.client.playlists.addEditor(context.user.id, name.trim(), targetUserId);
            await context.editReply(`Shared **${name}** with **${targetUsername}**.`);
        } catch (e) {
            await context.editReply(`Failed to share playlist: ${(e as Error).message}`);
        }
    }

    static async unshare(context: CommandContext, name: string, targetUserId: string, targetUsername: string): Promise<void> {
        if (!name || name.trim().length === 0) {
            await context.reply('Provide a playlist name.', true);
            return;
        }
        if (!targetUserId) {
            await context.reply('Mention a user to revoke access from.', true);
            return;
        }

        await context.deferReply();
        try {
            await context.client.playlists.removeEditor(context.user.id, name.trim(), targetUserId);
            await context.editReply(`Revoked **${targetUsername}**'s access to **${name}**.`);
        } catch (e) {
            await context.editReply(`Failed to unshare playlist: ${(e as Error).message}`);
        }
    }
}
