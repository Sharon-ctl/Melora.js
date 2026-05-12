import type { Database } from '../Database.js';
import type { FavoritesData, TrackInfo } from '../../types/index.js';

const TABLE = 'favorites';
const MAX_FAVORITES = 100;

export class FavoritesRepo {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async get(userId: string): Promise<FavoritesData> {
        const data = await this.db.get<FavoritesData>(TABLE, userId);
        return data ?? { userId, tracks: [] };
    }

    async add(userId: string, track: TrackInfo): Promise<{ success: boolean; reason?: string }> {
        const data = await this.get(userId);

        if (data.tracks.length >= MAX_FAVORITES) {
            return { success: false, reason: `You can only have up to ${MAX_FAVORITES} favorites.` };
        }

        // Check for duplicates by URI
        if (data.tracks.some(t => t.uri === track.uri)) {
            return { success: false, reason: 'This track is already in your favorites.' };
        }

        data.tracks.push(track);
        await this.db.set(TABLE, userId, data);
        return { success: true };
    }

    async remove(userId: string, trackUri: string): Promise<boolean> {
        const data = await this.get(userId);
        const before = data.tracks.length;
        data.tracks = data.tracks.filter(t => t.uri !== trackUri);

        if (data.tracks.length === before) return false;

        await this.db.set(TABLE, userId, data);
        return true;
    }

    async has(userId: string, trackUri: string): Promise<boolean> {
        const data = await this.get(userId);
        return data.tracks.some(t => t.uri === trackUri);
    }

    async clear(userId: string): Promise<number> {
        const data = await this.get(userId);
        const count = data.tracks.length;
        data.tracks = [];
        await this.db.set(TABLE, userId, data);
        return count;
    }

    async toggle(userId: string, track: TrackInfo): Promise<boolean> {
        const isFav = await this.has(userId, track.uri);
        if (isFav) {
            await this.remove(userId, track.uri);
            return false; // removed
        } else {
            await this.add(userId, track);
            return true; // added
        }
    }
}
