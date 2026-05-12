import type { MeloraClient } from '../core/Client.js';
import type { SessionBackup } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

const TABLE = 'session_backups';

export class QueuePersistenceService {
    private client: MeloraClient;
    private saveInterval: ReturnType<typeof setInterval> | null = null;
    private readonly SAVE_INTERVAL_MS = 60000; // 60s

    constructor(client: MeloraClient) {
        this.client = client;
    }

    start(): void {
        if (this.saveInterval) return;
        this.saveInterval = setInterval(() => {
            void this.saveAllSessions().catch(e =>
                Logger.warn('QueuePersistence', `Auto-save failed: ${(e as Error).message}`)
            );
        }, this.SAVE_INTERVAL_MS);
        Logger.info('QueuePersistence', 'Started auto-save interval (60s).');
    }

    stop(): void {
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
    }

    async saveAllSessions(forceShutdown = false): Promise<number> {
        const sessions = this.client.music.getAllSessions();
        let saved = 0;

        for (const session of sessions) {
            // During normal auto-saves, only persist actively playing or 24/7 sessions
            // During shutdown, save ANY session that has a current track or queued tracks
            if (!forceShutdown) {
                if (!session.isPlaying && !session.is247) continue;
            } else {
                // On shutdown: skip only if there's truly nothing to restore
                if (!session.queue.current && session.queue.size === 0 && !session.is247) continue;
            }

            try {
                const backup: SessionBackup = {
                    guildId: session.guildId,
                    voiceChannelId: session.voiceChannel?.id ?? '',
                    textChannelId: session.textChannel?.id ?? '',
                    currentTrack: session.queue.current ?? null,
                    queue: session.queue.getAll(),
                    volume: session.player?.volume ?? 100,
                    loopMode: session.queue.loopMode,
                    is247: session.is247,
                    savedAt: Date.now(),
                };

                await this.client.database.set(TABLE, session.guildId, backup);
                saved++;
            } catch (e) {
                Logger.warn('QueuePersistence', `Failed to save session for ${session.guildId}: ${(e as Error).message}`);
            }
        }

        // During shutdown, force an immediate flush to disk (bypass the 1s debounce)
        if (forceShutdown && saved > 0) {
            await this.client.database.close();
        }

        if (saved > 0) {
            Logger.info('QueuePersistence', `Saved ${saved} sessions${forceShutdown ? ' (shutdown)' : ''}.`);
        }
        return saved;
    }

    async restoreAllSessions(): Promise<number> {
        let restored = 0;

        try {
            const backups = await this.client.database.getAll<SessionBackup>(TABLE);
            if (!backups || backups.length === 0) return 0;

            // Wait for node to be fully ready ONCE before starting the massive restore loop!
            // This prevents adding a new event listener for every single session, which causes
            // a MaxListenersExceededWarning memory leak on a large bot restart (the 'Thundering Herd').
            const node = this.client.shoukaku.options.nodeResolver(this.client.shoukaku.nodes);
            if (node && node.state !== 2) { // 2 = CONNECTED
                await new Promise<void>(resolve => {
                    const timeout = setTimeout(resolve, 10000); // Max 10s wait for Lavalink
                    node.once('ready', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            }

            for (const backup of backups) {
                try {
                    // Skip stale backups (older than 12 hours)
                    if (Date.now() - backup.savedAt > 12 * 60 * 60 * 1000) {
                        await this.client.database.delete(TABLE, backup.guildId);
                        continue;
                    }

                    const guild = this.client.guilds.cache.get(backup.guildId);
                    if (!guild) {
                        await this.client.database.delete(TABLE, backup.guildId);
                        continue;
                    }

                    const voiceChannel = guild.channels.cache.get(backup.voiceChannelId);
                    const textChannel = guild.channels.cache.get(backup.textChannelId);

                    if (!voiceChannel || !('joinable' in voiceChannel)) {
                        await this.client.database.delete(TABLE, backup.guildId);
                        continue;
                    }

                    // Only restore 24/7 sessions or those with queued tracks
                    if (!backup.is247 && backup.queue.length === 0 && !backup.currentTrack) {
                        await this.client.database.delete(TABLE, backup.guildId);
                        continue;
                    }

                    const session = await this.client.music.createSession(
                        backup.guildId,
                        voiceChannel as any,
                        textChannel as any,
                    );

                    session.is247 = backup.is247;
                    session.queue.loopMode = backup.loopMode;

                    // Restore queue
                    if (backup.queue.length > 0) {
                        session.queue.addMany(backup.queue);
                    }

                    // Restore volume
                    if (session.player && backup.volume !== 100) {
                        await session.player.setVolume(backup.volume);
                    }

                    // Start playing current track or next in queue
                    if (backup.currentTrack && session.player) {
                        // Re-add current track to front so it plays next
                        session.queue.addTop(backup.currentTrack);

                        // Because we waited globally above, we can safely fire and forget playback!
                        void session.play();
                    } else if (session.queue.size > 0) {
                        void session.play();
                    }

                    restored++;
                    Logger.info('QueuePersistence', `Restored session for guild ${backup.guildId} (${backup.queue.length} tracks, 24/7: ${backup.is247})`);

                    // Clean up backup after successful restore
                    await this.client.database.delete(TABLE, backup.guildId);
                } catch (e) {
                    Logger.warn('QueuePersistence', `Failed to restore session for ${backup.guildId}: ${(e as Error).message}`);
                    await this.client.database.delete(TABLE, backup.guildId).catch(() => { });
                }
            }
        } catch (e) {
            Logger.error('QueuePersistence', `Failed to load backups: ${(e as Error).message}`);
        }

        if (restored > 0) {
            Logger.info('QueuePersistence', `Restored ${restored} sessions from backup.`);
        }

        return restored;
    }

    async clearBackup(guildId: string): Promise<void> {
        await this.client.database.delete(TABLE, guildId).catch(() => { });
    }
}
