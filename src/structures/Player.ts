import type { Player as ShoukakuPlayer, FilterOptions } from 'shoukaku';
import { Logger } from '../utils/Logger.js';
import type { GuildSession } from './GuildSession.js';

export class Player {
    readonly shoukakuPlayer: ShoukakuPlayer;
    private readonly session: GuildSession;
    private _volume = 100;
    private _paused = false;
    private _retryCount = 0;
    private _filters: FilterOptions = {};
    private _stuckTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly MAX_RETRIES = 1;

    constructor(shoukakuPlayer: ShoukakuPlayer, session: GuildSession) {
        this.shoukakuPlayer = shoukakuPlayer;
        this.session = session;
        this.registerEvents();
    }

    get volume(): number {
        return this._volume;
    }

    get paused(): boolean {
        return this._paused;
    }

    get position(): number {
        return this.shoukakuPlayer.position;
    }

    async play(encoded: string, options?: any): Promise<void> {
        this._retryCount = 0;
        await this.shoukakuPlayer.playTrack({ track: { encoded }, ...options });
        this._paused = false;
    }

    async pause(): Promise<void> {
        try {
            await this.shoukakuPlayer.setPaused(true);
            this._paused = true;
        } catch (e) {
            Logger.warn('Player', `Failed to pause in ${this.session.guildId}: ${(e as Error).message}`);
        }
    }

    async resume(): Promise<void> {
        try {
            await this.shoukakuPlayer.setPaused(false);
            this._paused = false;
        } catch (e) {
            Logger.warn('Player', `Failed to resume in ${this.session.guildId}: ${(e as Error).message}`);
        }
    }

    async setVolume(vol: number): Promise<void> {
        this._volume = vol;
        try {
            const position = this.shoukakuPlayer.track && !this._paused ? this.shoukakuPlayer.position : undefined;
            await this.shoukakuPlayer.update({ volume: vol, position });
        } catch (e) {
            Logger.warn('Player', `Failed to set volume in ${this.session.guildId}: ${(e as Error).message}`);
        }
    }

    async seek(positionMs: number): Promise<void> {
        try {
            await this.shoukakuPlayer.seekTo(positionMs);
        } catch (e) {
            Logger.warn('Player', `Failed to seek in ${this.session.guildId}: ${(e as Error).message}`);
        }
    }

    async setFilters(filters: FilterOptions): Promise<void> {
        this._filters = filters;
        const position = this.shoukakuPlayer.track && !this._paused ? this.shoukakuPlayer.position : undefined;
        await this.shoukakuPlayer.update({ filters, position });
    }

    async clearFilters(): Promise<void> {
        this._filters = {};
        const position = this.shoukakuPlayer.track && !this._paused ? this.shoukakuPlayer.position : undefined;
        await this.shoukakuPlayer.update({ filters: {}, position });
    }

    get filters(): FilterOptions {
        return this._filters;
    }

    /** Stop the currently playing track. This will trigger the `end` event. */
    async stopTrack(): Promise<void> {
        await this.shoukakuPlayer.stopTrack();
    }

    async destroy(): Promise<void> {
        if (this._stuckTimer) {
            clearTimeout(this._stuckTimer);
            this._stuckTimer = null;
        }
        try {
            await this.shoukakuPlayer.destroy();
        } catch (e) {
            Logger.warn('Player', `Failed to destroy player in ${this.session.guildId}: ${(e as Error).message}`);
        }
    }

    private registerEvents(): void {
        this.shoukakuPlayer.on('start', () => {
            this.session.onTrackStart().catch((e) => Logger.error('Player', `onTrackStart error: ${e}`));
        });

        this.shoukakuPlayer.on('end', (data) => {
            // 'replaced' means a new track was loaded (e.g., via play()),
            // so do NOT advance the queue — the new track handles itself.
            if (data.reason === 'replaced') return;
            this.session.onTrackEnd().catch((e) => Logger.error('Player', `onTrackEnd error: ${e}`));
        });

        this.shoukakuPlayer.on('stuck', () => {
            Logger.warn('Player', `Track stuck in guild ${this.session.guildId}, skipping in 5s…`);
            // Guard against rapid stuck events — clear previous timer
            if (this._stuckTimer) clearTimeout(this._stuckTimer);
            this._stuckTimer = setTimeout(() => {
                this._stuckTimer = null;
                void this.session.onTrackEnd();
            }, 5000);
        });

        this.shoukakuPlayer.on('exception', (error) => {
            Logger.error('Player', `Error in guild ${this.session.guildId}: ${error.exception.message}`);
            if (this._retryCount < Player.MAX_RETRIES) {
                this._retryCount++;
                Logger.info('Player', `Retrying track (attempt ${this._retryCount}) in guild ${this.session.guildId}`);
                const current = this.session.queue.current;
                if (current?.encoded) {
                    void this.shoukakuPlayer.playTrack({ track: { encoded: current.encoded } });
                    return;
                }
            }
            void this.session.onTrackEnd();
        });

        this.shoukakuPlayer.on('closed', (data) => {
            Logger.warn('Player', `Connection closed in ${this.session.guildId}: code ${data.code}`);
        });
    }
}
