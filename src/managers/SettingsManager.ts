import type { MeloraClient } from '../core/Client.js';
import type { GuildSettingsData } from '../types/index.js';
import { GuildSettingsRepo } from '../database/repositories/GuildSettingsRepo.js';

export class SettingsManager {
    private readonly repo: GuildSettingsRepo;
    private readonly cache = new Map<string, GuildSettingsData>();

    constructor(client: MeloraClient) {
        this.repo = new GuildSettingsRepo(client.database);
    }

    async initialize(): Promise<void> {
        const allSettings = await this.repo.getAll();
        for (const s of allSettings) {
            this.cache.set(s.guildId, s);
        }
    }

    async getSettings(guildId: string): Promise<GuildSettingsData> {
        const cached = this.cache.get(guildId);
        if (cached) {
            // LRU: Move to end of Map by re-inserting
            this.cache.delete(guildId);
            this.cache.set(guildId, cached);
            return cached;
        }

        const settings = await this.repo.get(guildId);

        // LRU eviction: if over 1000 items, delete oldest (first key)
        if (this.cache.size >= 1000) {
            const first = this.cache.keys().next().value;
            if (first) this.cache.delete(first);
        }

        this.cache.set(guildId, settings);
        return settings;
    }

    async setDjRole(guildId: string, roleId: string | null): Promise<void> {
        const settings = await this.getSettings(guildId);
        settings.djRoleId = roleId;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async setRestricted(guildId: string, restricted: boolean): Promise<void> {
        const settings = await this.getSettings(guildId);
        settings.restricted = restricted;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async setVolumeLimit(guildId: string, limit: number): Promise<void> {
        const settings = await this.getSettings(guildId);
        settings.volumeLimit = limit;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async setMaxDuration(guildId: string, maxMs: number): Promise<void> {
        const settings = await this.getSettings(guildId);
        settings.maxDuration = maxMs;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async setMaxQueueSize(guildId: string, max: number): Promise<void> {
        const settings = await this.getSettings(guildId);
        settings.maxQueueSize = max;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async setDefaultVolume(guildId: string, volume: number): Promise<void> {
        const settings = await this.getSettings(guildId);
        settings.defaultVolume = volume;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async saveSettings(guildId: string, settings: GuildSettingsData): Promise<void> {
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    async updateSetting<K extends keyof GuildSettingsData>(guildId: string, key: K, value: GuildSettingsData[K]): Promise<void> {
        const settings = await this.getSettings(guildId);
        (settings as any)[key] = value;
        await this.repo.set(settings);
        this.cache.set(guildId, settings);
    }

    invalidateCache(guildId: string): void {
        this.cache.delete(guildId);
    }
}
