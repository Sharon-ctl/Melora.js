import type { VoiceBasedChannel, TextBasedChannel } from 'discord.js';
import type { Track as ShoukakuTrack } from 'shoukaku';
import type { MeloraClient } from '../core/Client.js';
import type { TrackInfo } from '../types/index.js';
import { GuildSession } from '../structures/GuildSession.js';
import { Player } from '../structures/Player.js';
import { Logger } from '../utils/Logger.js';

import { SpotifyManager } from './SpotifyManager.js';
import { SpotifyResolver } from '../services/SpotifyResolver.js';

export class MusicManager {
    private readonly client: MeloraClient;
    private readonly sessions = new Map<string, GuildSession>();
    readonly spotify: SpotifyManager;
    readonly spotifyResolver: SpotifyResolver;

    constructor(client: MeloraClient) {
        this.client = client;
        this.spotify = new SpotifyManager();
        this.spotifyResolver = new SpotifyResolver(client);
    }

    getSession(guildId: string): GuildSession | undefined {
        return this.sessions.get(guildId);
    }

    hasSession(guildId: string): boolean {
        return this.sessions.has(guildId);
    }

    async createSession(
        guildId: string,
        voiceChannel: VoiceBasedChannel,
        textChannel: TextBasedChannel,
    ): Promise<GuildSession> {
        let session = this.sessions.get(guildId);
        if (session?.player) return session;

        session = new GuildSession(guildId, this.client);
        session.voiceChannel = voiceChannel;
        session.textChannel = textChannel;

        let shoukakuPlayer;
        try {
            shoukakuPlayer = await this.client.shoukaku.joinVoiceChannel({
                guildId,
                channelId: voiceChannel.id,
                shardId: this.client.guilds.cache.get(guildId)?.shardId ?? 0,
                deaf: true,
            });
        } catch (error) {
            // Check for specific Discord permission errors if possible, usually Shoukaku just throws generic errors or timeouts
            const errTyped = error as Error;
            Logger.error('MusicManager', `Failed to join channel: ${errTyped.message}`);

            // If we get "existing connection", try to leave and rejoin
            if (errTyped.message?.includes('existing connection')) {
                try {
                    this.client.shoukaku.leaveVoiceChannel(guildId);
                    await new Promise(res => setTimeout(res, 500)); // Wait for cleanup
                    shoukakuPlayer = await this.client.shoukaku.joinVoiceChannel({
                        guildId,
                        channelId: voiceChannel.id,
                        shardId: 0,
                        deaf: true,
                    });
                } catch (retryError) {
                    throw new Error(`Failed to connect to voice channel: ${(retryError as Error).message}`);
                }
            } else {
                // Re-throw so the command handler knows we failed
                throw new Error(`Failed to connect to voice channel: ${errTyped.message}`);
            }
        }

        const player = new Player(shoukakuPlayer, session);

        // Apply guild settings
        try {
            const settings = await this.client.settings.getSettings(guildId);
            session.queue.setMaxSize(settings.maxQueueSize);
            await player.setVolume(settings.defaultVolume);
        } catch (error) {
            Logger.warn('MusicManager', `Failed to apply settings to session ${guildId}: ${error}`);
            // Fallback to 100 on error
            await player.setVolume(100);
        }

        session.setPlayer(player);
        this.sessions.set(guildId, session);

        Logger.info('MusicManager', `Session created for guild ${guildId}`);
        return session;
    }

    private readonly searchCache = new Map<string, { result: import('../types/index.js').MusicSearchResult, expiresAt: number }>();
    private readonly SEARCH_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
    private readonly MAX_SEARCH_CACHE_SIZE = 500;

    async search(query: string, requester: import('discord.js').User): Promise<import('../types/index.js').MusicSearchResult> {
        // Quick cache check
        const cacheKey = query.trim().toLowerCase();
        const cached = this.searchCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            // Give cached items fresh requesters
            const freshResult = { ...cached.result };
            if (freshResult.tracks) {
                freshResult.tracks = freshResult.tracks.map(t => ({ ...t, requester: { id: requester.id, username: requester.username } }));
            }
            return freshResult;
        }

        const node = this.client.shoukaku.options.nodeResolver(this.client.shoukaku.nodes);
        if (!node) throw new Error('No available Lavalink nodes.');

        const isSpotifyUrl = query.match(/^https?:\/\/(?:open|play)\.spotify\.com\/.*$/);
        let finalResult: import('../types/index.js').MusicSearchResult;

        if (isSpotifyUrl) {
            const spotifyResult = await this.spotify.resolve(query, requester);
            if (spotifyResult.type !== 'error' && spotifyResult.type !== 'none') {
                if (spotifyResult.type === 'playlist' || spotifyResult.type === 'album') {
                    spotifyResult.tracks.forEach(t => t.playlistName = spotifyResult.name);
                    finalResult = { type: 'playlist', tracks: spotifyResult.tracks, playlistName: spotifyResult.name, playlistArtwork: spotifyResult.artwork };
                } else {
                    finalResult = { type: 'track', tracks: spotifyResult.tracks };
                }
            } else {
                // Spotify API failed (rate limit, etc.) — fallback to Lavalink
                Logger.warn('MusicManager', `Spotify API failed for URL, falling back to Lavalink: ${query}`);
                const lavalinkResult = await node.rest.resolve(query).catch(() => null);
                if (lavalinkResult && lavalinkResult.loadType !== 'empty' && lavalinkResult.loadType !== 'error') {
                    try {
                        if (lavalinkResult.loadType === 'playlist') {
                            const tracks = lavalinkResult.data.tracks.map((t) => this.mapTrackData(t, lavalinkResult.data.info.name, { id: requester.id, username: requester.username }));
                            finalResult = { type: 'playlist', tracks, playlistName: lavalinkResult.data.info.name };
                        } else {
                            const tracks = lavalinkResult.loadType === 'search' ? lavalinkResult.data : [lavalinkResult.data];
                            const mapped = (Array.isArray(tracks) ? tracks : [tracks]).map((t) => this.mapTrackData(t as any, undefined, { id: requester.id, username: requester.username }));
                            finalResult = { type: 'track', tracks: mapped };
                        }
                    } catch (e) {
                        Logger.warn('MusicManager', `Lavalink fallback mapping failed: ${e}`);
                        finalResult = { type: 'search', tracks: [] };
                    }
                } else {
                    finalResult = { type: 'search', tracks: [] };
                }
            }
        } else {
            const isUrl = /^https?:\/\//.test(query);
            if (isUrl || /soundcloud/i.test(query)) {
                const searchQuery = isUrl ? query : `scsearch:${query}`;
                const result = await node.rest.resolve(searchQuery);

                if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                    finalResult = { type: 'search', tracks: [] };
                } else if (result.loadType === 'playlist') {
                    const tracks = result.data.tracks.map((t) => this.mapTrackData(t, result.data.info.name, { id: requester.id, username: requester.username }));
                    finalResult = { type: 'playlist', tracks, playlistName: result.data.info.name };
                } else {
                    const tracks = result.loadType === 'search' ? result.data : [result.data];
                    const mapped = tracks.map((t) => this.mapTrackData(t, undefined, { id: requester.id, username: requester.username }));
                    finalResult = {
                        type: result.loadType === 'search' ? 'search' : 'track',
                        tracks: mapped
                    };
                }
            } else {
                // Free-text query: Route to Spotify for premium metadata match
                const spotifyTracks = await this.spotify.search(query, 5);
                if (spotifyTracks && spotifyTracks.length > 0) {
                    const mapped = spotifyTracks.map(t => ({ ...t, requester: { id: requester.id, username: requester.username } }));
                    finalResult = { type: 'search', tracks: mapped };
                } else {
                    // Fallback to Lavalink YouTube search if Spotify API fails or finds nothing
                    const result = await node.rest.resolve(`ytsearch:${query}`);
                    if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                        finalResult = { type: 'search', tracks: [] };
                    } else {
                        const tracks = result.loadType === 'search'
                            ? (result.data as import('shoukaku').Track[])
                            : [result.data as import('shoukaku').Track];
                        const mapped = tracks.map((t) => this.mapTrackData(t, undefined, { id: requester.id, username: requester.username }));
                        finalResult = { type: 'search', tracks: mapped };
                    }
                }
            }
        }

        // Save successfully resolved searches to cache
        if (finalResult.tracks.length > 0) {
            // Evict oldest if full
            if (this.searchCache.size >= this.MAX_SEARCH_CACHE_SIZE) {
                const firstKey = this.searchCache.keys().next().value;
                if (firstKey) this.searchCache.delete(firstKey);
            }
            this.searchCache.set(cacheKey, {
                result: finalResult,
                expiresAt: Date.now() + this.SEARCH_CACHE_TTL
            });
        }

        return finalResult;
    }

    private resolveQueue: { track: TrackInfo; resolve: (val: TrackInfo) => void; priority: boolean }[] = [];
    private activeResolves = 0;
    private static readonly MAX_CONCURRENT_RESOLVES = 15;
    private static readonly MAX_RESOLVE_QUEUE_SIZE = 500;

    async resolveTrack(track: TrackInfo, priority = false): Promise<TrackInfo> {
        if (!track.unresolved || track.encoded) return track;

        if (this.resolveQueue.length >= MusicManager.MAX_RESOLVE_QUEUE_SIZE) {
            Logger.warn('MusicManager', 'Resolve queue full, rejecting resolve request');
            return track;
        }

        return new Promise((resolve) => {
            if (priority) {
                // High priority: Add to front of queue
                this.resolveQueue.unshift({ track, resolve, priority });
            } else {
                // Low priority: Add to back
                this.resolveQueue.push({ track, resolve, priority });
            }
            void this.processResolveQueue();
        });
    }

    private async processResolveQueue(): Promise<void> {
        if (this.activeResolves >= MusicManager.MAX_CONCURRENT_RESOLVES || this.resolveQueue.length === 0) return;

        this.activeResolves++;

        const item = this.resolveQueue.shift();
        if (!item) {
            this.activeResolves--;
            return;
        }

        const { track, resolve } = item;

        try {
            if (track.sourceName === 'spotify') {
                // Delegate Spotify resolution to the premium resolver
                await this.spotifyResolver.resolve(track, item.priority);
            } else {
                // Non-Spotify unresolved tracks: resolve via Lavalink directly
                await this.resolveLavalink(track);
            }
        } catch (error) {
            Logger.warn('MusicManager', `Failed to resolve track ${track.title}: ${error}`);
        } finally {
            resolve(track);
            this.activeResolves--;
            await new Promise(r => setImmediate(r));
            void this.processResolveQueue();
        }
    }

    /**
     * Resolve a non-Spotify unresolved track via Lavalink text search.
     * This preserves the original behavior for non-Spotify sources.
     */
    private async resolveLavalink(track: TrackInfo): Promise<void> {
        const node = this.client.shoukaku.options.nodeResolver(this.client.shoukaku.nodes);
        if (!node) return;

        const artists = track.artists ? track.artists.map(a => a.name).join(' ') : track.author;
        const cleanTitle = (track.name || track.title).replace(/[\(\[][^\)\]]*[\)\]]/g, '').trim();
        const query = `ytsearch:${cleanTitle} ${artists}`;

        const result = await Promise.race([
            node.rest.resolve(query),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Resolve timeout')), 10000)),
        ]).catch(() => null);

        if (!result || result.loadType === 'empty' || result.loadType === 'error') return;

        const candidates = result.loadType === 'playlist'
            ? result.data.tracks
            : (Array.isArray(result.data) ? result.data : [result.data]);

        if (candidates.length > 0) {
            const best = candidates[0];
            track.encoded = best.encoded;
            track.originalUri = track.originalUri || track.uri;
            track.duration = best.info.length;
            track.title = best.info.title;
            track.author = best.info.author;
            track.uri = best.info.uri || track.uri;
            track.sourceName = best.info.sourceName || 'youtube';
            if (best.info.artworkUrl) track.artworkUrl = best.info.artworkUrl;
            track.unresolved = false;
        }
    }

    destroySession(guildId: string): void {
        const session = this.sessions.get(guildId);
        if (!session) return;
        this.sessions.delete(guildId);
        Logger.info('MusicManager', `Session destroyed for guild ${guildId}`);
    }

    getActiveSessions(): number {
        return this.sessions.size;
    }

    getAllSessions(): GuildSession[] {
        return [...this.sessions.values()];
    }

    private mapTrackData(track: ShoukakuTrack, playlistName?: string, requester?: { id: string; username: string }): TrackInfo {
        return {
            encoded: track.encoded,
            title: track.info.title,
            author: track.info.author,
            uri: track.info.uri ?? '',
            duration: track.info.length,
            artworkUrl: track.info.artworkUrl ?? undefined,
            sourceName: track.info.sourceName ?? undefined,
            playlistName: playlistName,
            requester: requester ?? { id: '', username: '' },
        };
    }
}
