import type { Database } from '../Database.js';
import type { PlayHistoryEntry } from '../../types/index.js';

const TABLE = 'play_history';

export class PlayHistoryRepo {
    constructor(private readonly db: Database) { }

    async add(entry: PlayHistoryEntry): Promise<void> {
        // O(1) deduplication: use guildId:trackUri as key so replaying the same
        // track in the same guild just overwrites the old entry with updated timestamp.
        // This avoids the previous O(n) full-table query + sequential deletes.
        const dedupeKey = `${entry.guildId}:${entry.trackUri}`;
        // Also keep a user-scoped key for getUserHistory queries
        const data = { ...entry, _dedupeKey: dedupeKey };
        await this.db.set(TABLE, dedupeKey, data as unknown as Record<string, unknown>);
    }

    async getUserHistory(userId: string, guildId: string, limit: number): Promise<PlayHistoryEntry[]> {
        const all = await this.db.query<PlayHistoryEntry>(
            TABLE,
            (e) => e.userId === userId && e.guildId === guildId,
        );
        return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }

    async getGuildHistory(guildId: string, limit: number): Promise<PlayHistoryEntry[]> {
        const all = await this.db.query<PlayHistoryEntry>(TABLE, (e) => e.guildId === guildId);
        return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }

    async getRecentUris(guildId: string, count: number): Promise<string[]> {
        const history = await this.getGuildHistory(guildId, count);
        return history.map((e) => e.trackUri);
    }

    async getGlobalHistory(limit: number): Promise<PlayHistoryEntry[]> {
        const all = await this.db.query<PlayHistoryEntry>(TABLE, () => true);
        return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }
}
