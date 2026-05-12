import type { Database } from '../Database.js';
import type { GuildSettingsData } from '../../types/index.js';
import { DEFAULT_GUILD_SETTINGS } from '../../types/index.js';

const TABLE = 'guild_settings';

export class GuildSettingsRepo {
    constructor(private readonly db: Database) { }

    async get(guildId: string): Promise<GuildSettingsData> {
        const data = await this.db.get<GuildSettingsData>(TABLE, guildId);
        if (data) return data;
        return { guildId, ...DEFAULT_GUILD_SETTINGS };
    }

    async getAll(): Promise<GuildSettingsData[]> {
        return this.db.getAll<GuildSettingsData>(TABLE);
    }

    async set(settings: GuildSettingsData): Promise<void> {
        await this.db.set(TABLE, settings.guildId, settings as unknown as Record<string, unknown>);
    }

    async delete(guildId: string): Promise<boolean> {
        return this.db.delete(TABLE, guildId);
    }
}
