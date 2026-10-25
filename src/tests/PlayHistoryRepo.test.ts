import assert from 'node:assert/strict';
import test from 'node:test';
import type { Database } from '../database/Database.js';
import { PlayHistoryRepo } from '../database/repositories/PlayHistoryRepo.js';
import type { PlayHistoryEntry } from '../types/index.js';

class MemoryDatabase {
    private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();

    async set<T extends Record<string, unknown>>(table: string, key: string, value: T): Promise<void> {
        const rows = this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
        rows.set(key, value);
        this.tables.set(table, rows);
    }

    async query<T>(table: string, filter: (item: T) => boolean): Promise<T[]> {
        const rows = this.tables.get(table);
        const values = [...(rows?.values() ?? [])] as T[];
        return values.filter(filter);
    }
}

function entry(userId: string, timestamp: number): PlayHistoryEntry {
    return {
        userId,
        guildId: 'guild-1',
        trackTitle: 'Shared song',
        trackAuthor: 'Artist',
        trackUri: 'https://example.test/shared-song',
        duration: 120_000,
        timestamp,
    };
}

test('same track played by different users stays in both histories', async () => {
    const db = new MemoryDatabase();
    const history = new PlayHistoryRepo(db as unknown as Database);
    await history.add(entry('user-a', 100));
    await history.add(entry('user-b', 200));

    assert.equal((await history.getUserHistory('user-a', 'guild-1', 10)).length, 1);
    assert.equal((await history.getUserHistory('user-b', 'guild-1', 10)).length, 1);
    assert.equal((await history.getGuildHistory('guild-1', 10)).length, 2);
});

test('repeat play updates the user track entry and history stays newest-first', async () => {
    const db = new MemoryDatabase();
    const history = new PlayHistoryRepo(db as unknown as Database);
    await history.add(entry('user-a', 100));
    await history.add({ ...entry('user-a', 300), trackUri: 'https://example.test/second' });
    await history.add(entry('user-a', 500));

    const result = await history.getUserHistory('user-a', 'guild-1', 10);
    assert.deepEqual(result.map(item => item.trackUri), [
        'https://example.test/shared-song',
        'https://example.test/second',
    ]);
    assert.equal(result[0]?.timestamp, 500);
});

test('history applies requested limit after sorting and deduplication', async () => {
    const db = new MemoryDatabase();
    const history = new PlayHistoryRepo(db as unknown as Database);
    await history.add({ ...entry('user-a', 100), trackUri: 'track-a' });
    await history.add({ ...entry('user-a', 200), trackUri: 'track-b' });
    await history.add({ ...entry('user-a', 300), trackUri: 'track-c' });

    const result = await history.getUserHistory('user-a', 'guild-1', 2);
    assert.deepEqual(result.map(item => item.trackUri), ['track-c', 'track-b']);
});
