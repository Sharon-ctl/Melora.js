import type { Database } from '../Database.js';
import type { PlaylistData, TrackInfo } from '../../types/index.js';

const TABLE = 'playlists';

function makeKey(userId: string, name: string): string {
    return name.includes(':') ? name : `${userId}:${name.toLowerCase()}`;
}

export class PlaylistRepo {
    constructor(private readonly db: Database) { }

    async get(userId: string, name: string): Promise<PlaylistData | null> {
        return this.db.get<PlaylistData>(TABLE, makeKey(userId, name));
    }

    async getUserPlaylists(userId: string): Promise<PlaylistData[]> {
        return this.db.query<PlaylistData>(TABLE, (p) => p.userId === userId || !!p.editors?.includes(userId));
    }

    async create(userId: string, name: string): Promise<PlaylistData> {
        const key = makeKey(userId, name);
        const existing = await this.db.get<PlaylistData>(TABLE, key);
        if (existing) throw new Error(`Playlist "${name}" already exists.`);

        const playlist: PlaylistData = {
            id: key,
            userId,
            name,
            tracks: [],
            editors: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await this.db.set(TABLE, key, playlist as unknown as Record<string, unknown>);
        return playlist;
    }

    private validateAccess(playlist: PlaylistData, userId: string): void {
        if (playlist.userId !== userId && !playlist.editors?.includes(userId)) {
            throw new Error(`Not authorized to edit playlist "${playlist.name}".`);
        }
    }

    private validateOwner(playlist: PlaylistData, userId: string): void {
        if (playlist.userId !== userId) {
            throw new Error(`Only the owner can manage sharing or delete the playlist "${playlist.name}".`);
        }
    }

    async addTrack(userId: string, name: string, track: TrackInfo): Promise<void> {
        const key = makeKey(userId, name);
        const playlist = await this.db.get<PlaylistData>(TABLE, key);
        if (!playlist) throw new Error(`Playlist "${name}" not found.`);
        this.validateAccess(playlist, userId);

        await this.db.push(TABLE, key, 'tracks', track);
    }

    async addTracks(userId: string, name: string, tracks: TrackInfo[]): Promise<void> {
        const playlist = await this.get(userId, name);
        if (!playlist) throw new Error(`Playlist "${name}" not found.`);
        this.validateAccess(playlist, userId);

        // Push full TrackInfo records to preserve metadata
        for (const track of tracks) {
            playlist.tracks.push({
                ...track,
                requester: { id: userId, username: 'Unknown' } // Re-assign requester to playlist owner
            });
        }
        playlist.updatedAt = Date.now();
        await this.db.set(TABLE, makeKey(userId, name), playlist as unknown as Record<string, unknown>);
    }

    async removeTrack(userId: string, name: string, index: number): Promise<void> {
        const playlist = await this.get(userId, name);
        if (!playlist) throw new Error(`Playlist "${name}" not found.`);
        this.validateAccess(playlist, userId);

        if (index < 0 || index >= playlist.tracks.length) throw new Error('Invalid track index.');
        playlist.tracks.splice(index, 1);
        playlist.updatedAt = Date.now();
        await this.db.set(TABLE, makeKey(userId, name), playlist as unknown as Record<string, unknown>);
    }

    async delete(userId: string, name: string): Promise<boolean> {
        const key = makeKey(userId, name);
        const playlist = await this.db.get<PlaylistData>(TABLE, key);
        if (playlist) {
            this.validateOwner(playlist, userId);
            return this.db.delete(TABLE, key);
        }
        return false;
    }

    async rename(userId: string, oldName: string, newName: string): Promise<void> {
        const oldKey = makeKey(userId, oldName);
        const newKey = makeKey(userId, newName);

        if (oldKey === newKey) return; // Same name case-insensitive

        const existing = await this.db.get<PlaylistData>(TABLE, newKey);
        if (existing) throw new Error(`Playlist "${newName}" already exists.`);

        const playlist = await this.db.get<PlaylistData>(TABLE, oldKey);
        if (!playlist) throw new Error(`Playlist "${oldName}" not found.`);
        this.validateOwner(playlist, userId);

        // Atomic-ish rename: Delete old, Set new
        await this.db.delete(TABLE, oldKey);
        playlist.name = newName;
        playlist.id = newKey;
        playlist.updatedAt = Date.now();
        await this.db.set(TABLE, newKey, playlist as unknown as Record<string, unknown>);
    }

    async addEditor(userId: string, name: string, editorId: string): Promise<void> {
        const key = makeKey(userId, name);
        const playlist = await this.db.get<PlaylistData>(TABLE, key);
        if (!playlist) throw new Error(`Playlist "${name}" not found.`);
        this.validateOwner(playlist, userId);

        if (!playlist.editors) playlist.editors = [];
        if (!playlist.editors.includes(editorId)) {
            playlist.editors.push(editorId);
            playlist.updatedAt = Date.now();
            await this.db.set(TABLE, key, playlist as unknown as Record<string, unknown>);
        }
    }

    async removeEditor(userId: string, name: string, editorId: string): Promise<void> {
        const key = makeKey(userId, name);
        const playlist = await this.db.get<PlaylistData>(TABLE, key);
        if (!playlist) throw new Error(`Playlist "${name}" not found.`);
        this.validateOwner(playlist, userId);

        if (playlist.editors) {
            playlist.editors = playlist.editors.filter(id => id !== editorId);
            playlist.updatedAt = Date.now();
            await this.db.set(TABLE, key, playlist as unknown as Record<string, unknown>);
        }
    }
}
