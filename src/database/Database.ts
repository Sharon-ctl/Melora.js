import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readFile, writeFile, rename } from 'fs/promises';
import { Logger } from '../utils/Logger.js';

export interface DatabaseAdapter {
    get<T>(table: string, key: string): Promise<T | null>;
    getAll<T>(table: string): Promise<T[]>;
    set<T extends Record<string, any>>(table: string, key: string, value: T): Promise<void>;
    delete(table: string, key: string): Promise<boolean>;
    push<T>(table: string, key: string, path: string, value: T): Promise<void>;
    query<T>(table: string, filter: (item: T) => boolean): Promise<T[]>;
    close(): Promise<void>;
}

class JsonFileAdapter implements DatabaseAdapter {
    private cache: Record<string, Record<string, any>> = {};
    private readonly dataDir: string;
    private saveTimers: Record<string, NodeJS.Timeout> = {};
    private isSaving: Record<string, boolean> = {};

    constructor() {
        this.dataDir = join(process.cwd(), 'data');
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
    }

    private getFilePath(table: string): string {
        // Sanitize table name to prevent traversal
        const safeName = table.replace(/[^a-z0-9_-]/gi, '_');
        return join(this.dataDir, `${safeName}.json`);
    }

    private async loadTable(table: string): Promise<void> {
        if (this.cache[table]) return;

        const path = this.getFilePath(table);
        if (existsSync(path)) {
            let raw = '';
            try {
                raw = await readFile(path, 'utf-8');
                this.cache[table] = JSON.parse(raw);
            } catch (e) {
                Logger.error('Database', `Failed to parse table ${table}. Corrupted JSON detected. Creating backup...`, e as Error);
                try {
                    // Backup the corrupted file
                    const corruptPath = `${path}.corrupted.${Date.now()}.bak`;
                    await rename(path, corruptPath);
                    Logger.warn('Database', `Corrupted table ${table} backed up to ${corruptPath}`);
                } catch (backupError) {
                    Logger.error('Database', `Failed to backup corrupted table ${table}`, backupError as Error);
                }
                // Auto-repair by resetting to empty state
                this.cache[table] = {};
                this.scheduleSave(table);
            }
        } else {
            this.cache[table] = {};
        }
    }

    private scheduleSave(table: string): void {
        if (this.saveTimers[table]) return;
        this.saveTimers[table] = setTimeout(() => void this.flush(table), 1000); // 1s debounce
    }

    private async flush(table: string): Promise<void> {
        if (this.isSaving[table]) {
            // If already saving, reschedule
            this.saveTimers[table] = setTimeout(() => void this.flush(table), 1000);
            return;
        }

        this.isSaving[table] = true;
        delete this.saveTimers[table];

        const path = this.getFilePath(table);
        const tempPath = `${path}.tmp`;

        try {
            const data = this.cache[table] || {};
            await writeFile(tempPath, JSON.stringify(data, null, 2));
            await rename(tempPath, path);
        } catch (error) {
            Logger.error('Database', `Failed to save table ${table}`, error as Error);
        } finally {
            this.isSaving[table] = false;
        }
    }

    async get<T>(table: string, key: string): Promise<T | null> {
        await this.loadTable(table);
        return (this.cache[table]?.[key] as T) ?? null;
    }

    async getAll<T>(table: string): Promise<T[]> {
        await this.loadTable(table);
        const tbl = this.cache[table];
        if (!tbl) return [];
        return Object.values(tbl) as T[];
    }

    async set<T extends Record<string, any>>(table: string, key: string, value: T): Promise<void> {
        await this.loadTable(table);
        if (!this.cache[table]) this.cache[table] = {};

        this.cache[table][key] = value;
        this.scheduleSave(table);
    }

    async delete(table: string, key: string): Promise<boolean> {
        await this.loadTable(table);
        if (!this.cache[table]?.[key]) return false;

        delete this.cache[table][key];
        this.scheduleSave(table);
        return true;
    }

    async push<T>(table: string, key: string, path: string, value: T): Promise<void> {
        await this.loadTable(table);
        if (!this.cache[table]?.[key]) return;

        const record = this.cache[table][key] as Record<string, any>;
        if (Array.isArray(record[path])) {
            (record[path] as T[]).push(value);
            this.scheduleSave(table);
        }
    }

    async query<T>(table: string, filter: (item: T) => boolean): Promise<T[]> {
        const all = await this.getAll<T>(table);
        return all.filter(filter);
    }

    async close(): Promise<void> {
        // Clear all timers
        for (const timer of Object.values(this.saveTimers)) {
            clearTimeout(timer);
        }
        this.saveTimers = {};

        // Flush all loaded tables from cache
        const tables = Object.keys(this.cache);
        for (const table of tables) {
            await this.flush(table);
        }
    }
}

export class Database {
    private adapter: DatabaseAdapter;

    constructor() {
        this.adapter = new JsonFileAdapter();
    }

    async initialize(): Promise<void> {
        Logger.info('Database', 'Initialized Multi-File JSON Storage');
        // No connection needed
    }

    get<T>(table: string, key: string): Promise<T | null> {
        return this.adapter.get<T>(table, key);
    }

    getAll<T>(table: string): Promise<T[]> {
        return this.adapter.getAll<T>(table);
    }

    set<T extends Record<string, any>>(table: string, key: string, value: T): Promise<void> {
        return this.adapter.set(table, key, value);
    }

    delete(table: string, key: string): Promise<boolean> {
        return this.adapter.delete(table, key);
    }

    push<T>(table: string, key: string, path: string, value: T): Promise<void> {
        return this.adapter.push(table, key, path, value);
    }

    query<T>(table: string, filter: (item: T) => boolean): Promise<T[]> {
        return this.adapter.query<T>(table, filter);
    }

    async close(): Promise<void> {
        await this.adapter.close();
    }
}
