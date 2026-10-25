import type { Database } from '../Database.js';
import type { PlayHistoryEntry } from '../../types/index.js';

const TABLE = 'play_history';

export class PlayHistoryRepo {
    constructor(private readonly db: Database) { }

    async add(entry: PlayHistoryEntry): Promise<void> {
        // Keep the latest play per user, guild, and track. Omitting userId here
        // caused one listener's play to overwrite another listener's history.
        const dedupeKey = `${entry.userId}:${entry.guildId}:${entry.trackUri}`;
        const data = { ...entry, _dedupeKey: dedupeKey };
        await this.db.set(TABLE, dedupeKey, data as unknown as Record<string, unknown>);
    }

    async getUserHistory(userId: string, guildId: string, limit: number): Promise<PlayHistoryEntry[]> {
        const all = await this.db.query<PlayHistoryEntry>(
            TABLE,
            (e) => e.userId === userId && e.guildId === guildId,
        );
        // Collapse legacy rows written with the old guild:track key alongside
        // the new user-scoped key, keeping the newest record for each track.
        const unique = new Map<string, PlayHistoryEntry>();
        for (const entry of all.sort((a, b) => b.timestamp - a.timestamp)) {
            if (!unique.has(entry.trackUri)) unique.set(entry.trackUri, entry);
        }
        return [...unique.values()].slice(0, limit);
    }

    async getGuildHistory(guildId: string, limit: number): Promise<PlayHistoryEntry[]> {
        const all = await this.db.query<PlayHistoryEntry>(TABLE, (e) => e.guildId === guildId);
        const unique = new Map<string, PlayHistoryEntry>();
        for (const entry of all.sort((a, b) => b.timestamp - a.timestamp)) {
            const key = `${entry.userId}:${entry.trackUri}`;
            if (!unique.has(key)) unique.set(key, entry);
        }
        return [...unique.values()].slice(0, limit);
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
