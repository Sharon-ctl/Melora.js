import { type TextBasedChannel, type VoiceBasedChannel } from 'discord.js';
import type { MeloraClient } from '../core/Client.js';
import type { TrackInfo } from '../types/index.js';
import { LoopMode } from '../types/index.js';
import { Player } from './Player.js';
import { Queue } from './Queue.js';
import { Logger } from '../utils/Logger.js';
import { NowPlayingPanel } from '../components/NowPlayingPanel.js';
import { config } from '../config/config.js';
import { Validators } from '../utils/Validators.js';

// Artwork LRU cache to avoid redundant Spotify API calls
const artworkCache = new Map<string, string>();
const ARTWORK_CACHE_MAX = 500;

export class GuildSession {
    readonly guildId: string;
    readonly queue: Queue;
    readonly client: MeloraClient;
    player: Player | null = null;
    textChannel: TextBasedChannel | null = null;
    voiceChannel: VoiceBasedChannel | null = null;
    private voteSkips = new Set<string>();
    private _nowPlayingPanel: NowPlayingPanel | null = null;
    private _idleTimer: ReturnType<typeof setTimeout> | null = null;
    private _processingTrackEnd = false;
    private _destroying = false;
    private _is247 = false;

    get is247(): boolean {
        return this._is247;
    }

    set is247(value: boolean) {
        this._is247 = value;
        if (value) {
            this.clearIdleTimer();
            Logger.info('GuildSession', `24/7 mode enabled for ${this.guildId}`);
            // If 24/7 mode is on and queue is empty, try to play default radio
            if (this.queue.isEmpty) {
                Logger.info('GuildSession', `Queue finished in 24/7 mode for ${this.guildId}`);
            }
        } else {
            this.resetIdleTimer();
            Logger.info('GuildSession', `24/7 mode disabled for ${this.guildId}`);
        }
        void this.nowPlayingPanel?.update();
    }

    constructor(guildId: string, client: MeloraClient) {
        this.guildId = guildId;
        this.client = client;
        this.queue = new Queue();
    }

    get nowPlayingPanel(): NowPlayingPanel | null {
        return this._nowPlayingPanel;
    }

    get isPlaying(): boolean {
        return this.player !== null && this.queue.current !== null;
    }

    setPlayer(player: Player): void {
        this.player = player;
        this.resetIdleTimer();
    }

    // UI-Synced Actions
    async pause(): Promise<void> {
        if (!this.player) return;
        await this.player.pause();
        await this.updateVoiceStatus('<:paused11:1490061892088107260> Song paused');
        await this.nowPlayingPanel?.update();
    }

    /**
     * Start playing the next track in the queue safely.
     * Centralized logic to replace duplicate background playback code in commands.
     */
    async play(): Promise<void> {
        if (this.isPlaying || this.queue.isEmpty || !this.player) return;

        const next = this.queue.dequeue();
        if (!next) return;

        try {
            if (next.unresolved) {
                const resolved = await this.client.music.resolveTrack(next);
                if (resolved.encoded) {
                    next.encoded = resolved.encoded;
                    next.duration = resolved.duration; // Sync duration
                } else {
                    if (this.textChannel && 'send' in this.textChannel) {
                        await this.textChannel.send(`Track failed to resolve: **${next.title}**`);
                    }
                    // Skip to next track safely
                    setImmediate(() => { void this.onTrackEnd(); });
                    return;
                }
            }

            if (this.player && next.encoded) {
                await this.player.play(next.encoded);
            }
        } catch (e) {
            Logger.error('GuildSession', `Background playback failed: ${(e as Error).message}`);
            if (this.textChannel && 'send' in this.textChannel) {
                await this.textChannel.send(`Playback error: ${(e as Error).message}`);
            }
            setImmediate(() => { void this.onTrackEnd(); });
        }
    }

    async resume(): Promise<void> {
        if (!this.player) return;
        await this.player.resume();
        const track = this.queue.current;
        if (track) {
            await this.updateVoiceStatus(`<:musicalnote:1474944534357082142> ${Validators.truncate(track.title, 40)}`);
        }
        await this.nowPlayingPanel?.update();
    }

    async setLoopMode(mode: LoopMode): Promise<void> {
        this.queue.loopMode = mode;
        await this.nowPlayingPanel?.update();
    }

    addVoteSkip(userId: string): number {
        this.voteSkips.add(userId);
        return this.voteSkips.size;
    }

    getVoteSkipCount(): number {
        return this.voteSkips.size;
    }

    clearVoteSkips(): void {
        this.voteSkips.clear();
    }

    getListenerCount(): number {
        if (!this.voiceChannel) return 0;
        return this.voiceChannel.members.filter((m) => !m.user.bot).size;
    }

    getVoteThreshold(): number {
        return Math.ceil(this.getListenerCount() / 2);
    }

    async onTrackStart(): Promise<void> {
        this.voteSkips.clear();
        this.clearIdleTimer();
        const track = this.queue.current;
        if (!track) return;


        // Check for dedicated music channel
        try {
            const settings = await this.client.settings.getSettings(this.guildId);
            if (settings.musicChannelId) {
                const channel = await this.client.channels.fetch(settings.musicChannelId) as TextBasedChannel;
                if (channel && channel.isTextBased()) {
                    this.textChannel = channel;
                }
            }
        } catch (e) {
            Logger.debug('GuildSession', `Failed to fetch settings/channel: ${e}`);
        }

        if (!this.textChannel) {
            // Still update VC status even without a text channel
            await this.updateVoiceStatus(`<:musicalnote:1474944534357082142> ${Validators.truncate(track.title, 40)}`);
            return;
        }

        // Instant UI Updates first: Priority 1
        // Generate YouTube thumbnails offline without APIs
        if (!track.artworkUrl && track.sourceName === 'youtube' && track.uri) {
            const match = track.uri.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&]+)/);
            if (match) {
                track.artworkUrl = `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
            }
        }

        // Try offline cache
        const cacheKey = `${track.title}::${track.author}`;
        if (!track.artworkUrl) {
            const cached = artworkCache.get(cacheKey);
            if (cached) track.artworkUrl = cached;
        }

        // If still missing, deploy a non-blocking background worker to fetch it
        if (!track.artworkUrl) {
            void (async () => {
                try {
                    const cleanTitle = track.title.replace(/[\(\[][^\)\]]*[\)\]]/g, '').trim();
                    const cleanAuthor = track.author.replace(/ - Topic|VEVO|Official/gi, '').trim();
                    const query = `${cleanTitle} ${cleanAuthor}`;
                    const results = await this.client.music.spotify.search(query, 1);

                    if (results.length > 0 && results[0].artworkUrl) {
                        track.artworkUrl = results[0].artworkUrl;

                        if (artworkCache.size >= ARTWORK_CACHE_MAX) {
                            const firstKey = artworkCache.keys().next().value;
                            if (firstKey) artworkCache.delete(firstKey);
                        }
                        artworkCache.set(cacheKey, results[0].artworkUrl);

                        // Async refresh the UI if the song is still playing
                        if (this.queue.current === track && this._nowPlayingPanel && !this._nowPlayingPanel.isDestroyed()) {
                            this._nowPlayingPanel.setTrack(track);
                            await this._nowPlayingPanel.update();
                        }
                    }
                } catch (e) {
                    // Silent fail for non-blocking worker
                }
            })();
        }

        // Update Voice Channel Status
        await this.updateVoiceStatus(`<:musicalnote:1474944534357082142> ${Validators.truncate(track.title, 40)}`);

        // ... existing code ...
        try {
            if (this._nowPlayingPanel && !this._nowPlayingPanel.isDestroyed()) {
                // Update existing panel
                this._nowPlayingPanel.setTrack(track);
                await this._nowPlayingPanel.update();
            } else {
                // New panel
                this._nowPlayingPanel = new NowPlayingPanel(track, this);
                if (this.textChannel) {
                    await this._nowPlayingPanel.send(this.textChannel);
                }
            }
        } catch {
            Logger.warn('GuildSession', `Failed to send now playing panel in ${this.guildId}`);
        }



        // Optimistic Pre-Resolve for Next Track
        this.autoResolveNext().catch((e: unknown) => {
            Logger.warn('GuildSession', `Failed to pre-resolve next track: ${e}`);
        });
    }

    async resendNowPlayingPanel(channel: TextBasedChannel): Promise<void> {
        if (this._nowPlayingPanel) {
            await this._nowPlayingPanel.destroy();
        }

        const track = this.queue.current;
        if (!track) return;

        this.textChannel = channel;
        this._nowPlayingPanel = new NowPlayingPanel(track, this);
        await this._nowPlayingPanel.send(channel);
    }

    /**
     * Called when the current track has naturally ended OR via Lavalink's `end` event.
     * Also called by skip button/command to advance to the next track.
     */
    async onTrackEnd(): Promise<void> {
        if (this._processingTrackEnd) return;
        this._processingTrackEnd = true;



        try {
            const track = this.queue.current;
            if (track) {
                // Record to global database history
                void this.client.playHistory.add({
                    userId: track.requester?.id || this.client.user?.id || 'unknown',
                    guildId: this.guildId,
                    trackTitle: track.title,
                    trackAuthor: track.author,
                    trackUri: track.uri,
                    duration: track.duration,
                    timestamp: Date.now()
                }).catch(e => Logger.warn('GuildSession', `Failed to save global history: ${e}`));
            }
            if (this.queue.isEmpty) {
                if (this.queue.loopMode === LoopMode.AUTOPLAY && this.queue.isEmpty) {
                    // Autoplay with 15s timeout to prevent hanging
                    try {
                        const autoTrack = await Promise.race([
                            this.tryAutoplay(),
                            new Promise<null>(r => setTimeout(() => r(null), 15000)),
                        ]);
                        if (autoTrack) {
                            this.queue.add(autoTrack);
                        }
                    } catch (e) {
                        Logger.warn('GuildSession', `Autoplay failed: ${(e as Error).message}`);
                    }
                }
            }

            const next = this.queue.dequeue();
            if (next && this.player) {
                // Resolve if needed (lazy loading for Spotify)
                if (next.unresolved) {
                    const resolved = await this.client.music.resolveTrack(next, true);
                    if (resolved.encoded) {
                        next.encoded = resolved.encoded;
                        next.duration = resolved.duration; // Sync duration
                    } else {
                        // Failed to resolve
                        if (this.textChannel && 'send' in this.textChannel) {
                            await this.textChannel.send(`Could not resolve track **${next.title}**.`);
                        }
                        this._processingTrackEnd = false;
                        // Use setImmediate to prevent recursive stack overflow with large unresolvable queues
                        setImmediate(() => void this.onTrackEnd()); // Skip to next
                        return;
                    }
                }

                // playTrack with a new track will stop the old one on Lavalink
                if (next.encoded) {
                    await this.player.play(next.encoded);
                }
            } else {
                // Nothing left to play — stop current audio and idle
                if (this.player) {
                    try {
                        await this.player.stopTrack();
                    } catch {
                        // Player may already be stopped
                    }
                }

                // Show idle message in VC status
                await this.updateVoiceStatus('<:musicalnote:1474944534357082142> Use /play to play songs!');

                this._nowPlayingPanel?.destroy();
                this._nowPlayingPanel = null;
                this.resetIdleTimer();
            }
        } finally {
            this._processingTrackEnd = false;
        }
    }

    /**
     * Explicitly skip the current track — stops audio and advances.
     * Use this from commands and buttons instead of raw onTrackEnd().
     */
    async skipCurrent(): Promise<void> {
        if (!this.player) return;
        await this.player.stopTrack();
    }

    async playPrevious(): Promise<void> {
        const prev = this.queue.previous();
        if (!prev) return;

        if (this.player) {
            if (prev.unresolved) {
                const resolved = await this.client.music.resolveTrack(prev, true);
                if (resolved.encoded) {
                    prev.encoded = resolved.encoded;
                } else {
                    if (this.textChannel && 'send' in this.textChannel) {
                        await this.textChannel.send(`Could not resolve track **${prev.title}**.`);
                    }
                    return;
                }
            }
            if (prev.encoded) {
                await this.player.play(prev.encoded);
            }
        }
    }

    private resetIdleTimer(): void {
        this.clearIdleTimer();
        if (this.is247) return; // 24/7 mode: do not set timeout

        const timeout = config.idleTimeoutMs;
        if (timeout <= 0) return;

        this._idleTimer = setTimeout(() => {
            Logger.info('GuildSession', `Idle timeout (${timeout / 1000}s) reached for guild ${this.guildId}`);
            void this.destroy();
        }, timeout);
    }

    private clearIdleTimer(): void {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    private async updateVoiceStatus(status: string | null = null): Promise<void> {
        // If we are destroying the session, ignore subsequent requests to set a non-null status
        if (this._destroying && status !== null) return;
        
        if (!this.voiceChannel) {
            Logger.warn('GuildSession', `updateVoiceStatus skipped: voiceChannel is null (guild: ${this.guildId})`);
            return;
        }
        const channelId = this.voiceChannel.id;
        Logger.debug('GuildSession', `Setting VC status for channel ${channelId}: "${status || '(clearing)'}"`);
        try {
            await this.client.rest.put(`/channels/${channelId}/voice-status` as `/${string}`, {
                body: { status },
            });
            Logger.debug('GuildSession', `VC status set successfully for channel ${channelId}`);
        } catch (error) {
            const err = error as Error;
            Logger.warn('GuildSession', `Failed to set VC status for channel ${channelId}: ${err.message || error}`);
            if (err.stack) Logger.warn('GuildSession', `Stack: ${err.stack}`);
        }
    }

    private async tryAutoplay(): Promise<TrackInfo | null> {
        const current = this.queue.current;
        if (!current) return null;

        const history = this.queue.getHistory();
        const recentUris: string[] = [];
        const recentOriginalUris: string[] = [];

        for (const t of history) {
            recentUris.push(t.uri);
            if (t.originalUri) recentOriginalUris.push(t.originalUri);
        }

        recentUris.push(current.uri);
        if (current.originalUri) recentOriginalUris.push(current.originalUri);

        const requester = current.requester;

        // Helper to normalize titles for fuzzy check - Aggressive Edition
        const normalize = (str: string) => {
            return str.toLowerCase()
                // Strip everything in parentheses or brackets (e.g. [Official Video], (Lyrics), (Live), (Remix))
                .replace(/[\(\[\{].*?[\)\]\}]/g, '')
                // Strip common text tags
                .replace(/official video|music video|lyric video|audio|official audio|live|acoustic|remix|cover|mv|official|video/g, '')
                // Remove non-alphanumeric
                .replace(/[^a-z0-9]/g, '')
                .trim();
        };

        // Helper to check if a track is a duplicate or a bad version
        const isDuplicateOrBad = (trackTitle: string, trackUri?: string) => {
            // Exact URI match in recent history
            if (trackUri && recentUris.includes(trackUri)) return true;
            if (trackUri && recentOriginalUris.includes(trackUri)) return true;

            const tTitle = normalize(trackTitle);
            if (tTitle.length < 3) return false; // Too short to accurately dedup fuzzy

            const checks = [...history.slice(0, 50)];
            if (current) checks.unshift(current);

            // Fuzzy title deduplication (Aggressive match)
            const isDuplicate = checks.some(h => {
                const hTitle = normalize(h.title);
                return hTitle === tTitle || (hTitle.length > 5 && tTitle.length > 5 && (hTitle.includes(tTitle) || tTitle.includes(hTitle)));
            });

            if (isDuplicate) return true;

            return false;
        };

        const artist = current.artists && current.artists.length > 0 ? current.artists[0].name : current.author;

        // 1. Try Spotify Recommendations (Primary Strategy)
        const spotifySeedIds: string[] = [];
        const spotifyArtistIds: string[] = [];

        // Try getting ID directly from URI or originalUri
        const currentUri = current.originalUri || current.uri;
        const trackMatch = currentUri.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/);

        let fetchedArtistId = false;

        if (trackMatch) {
            spotifySeedIds.push(trackMatch[1]);
            // If we have artists with IDs from Spotify natively
            if (current.artists && current.artists[0]?.id) {
                spotifyArtistIds.push(current.artists[0].id);
                fetchedArtistId = true;
            }
        }

        // Search Spotify for the current track to get seed IDs if not already found natively
        if (!trackMatch || !fetchedArtistId) {
            try {
                const cleanTitle = current.title.replace(/[\(\[][^\)\]]*[\)\]]/g, '').trim();
                const cleanAuthor = artist.replace(/ - Topic|VEVO|Official/gi, '').trim();
                const query = `${cleanTitle} ${cleanAuthor}`;
                const results = await this.client.music.spotify.search(query, 1);

                if (results.length > 0) {
                    const match = results[0].uri.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/);
                    if (match && !spotifySeedIds.includes(match[1])) {
                        spotifySeedIds.push(match[1]);
                    }
                    if (results[0].artists && results[0].artists[0]?.id && !spotifyArtistIds.includes(results[0].artists[0].id)) {
                        spotifyArtistIds.push(results[0].artists[0].id);
                    }
                }
            } catch (e) {
                Logger.warn('GuildSession', `Failed to find Spotify seed for autoplay: ${e}`);
            }
        }

        if (spotifySeedIds.length > 0 || spotifyArtistIds.length > 0) {
            try {
                Logger.debug('Autoplay', `Fetching Spotify recommendations for seed tracks: ${spotifySeedIds.join(',')} and artists: ${spotifyArtistIds.join(',')}`);
                const recommendations = await this.client.music.spotify.getRecommendations({
                    seed_tracks: spotifySeedIds,
                    seed_artists: spotifyArtistIds
                });

                for (const rec of recommendations) {
                    if (!isDuplicateOrBad(rec.title, rec.uri)) {
                        Logger.debug('Autoplay', `Found Spotify recommendation: ${rec.title} by ${rec.author}`);
                        rec.requester = requester;
                        return rec;
                    }
                }
                Logger.warn('Autoplay', 'Spotify recommendations fetched but all were duplicates or bad versions.');
            } catch (e) {
                Logger.warn('GuildSession', `Failed to fetch Spotify recommendations: ${e}`);
            }
        }

        // 2. Try Spotify Artist Top Tracks (Secondary Strategy)
        if (spotifyArtistIds.length > 0) {
            try {
                // Pick the first artist (primary author)
                const mainArtistId = spotifyArtistIds[0];
                Logger.debug('Autoplay', `Fetching Spotify Top Tracks for artist: ${mainArtistId}`);
                const topTracks = await this.client.music.spotify.getArtistTopTracks(mainArtistId);

                // Shuffle to add variety
                const shuffled = topTracks.sort(() => Math.random() - 0.5);
                for (const t of shuffled) {
                    if (!isDuplicateOrBad(t.title, t.uri)) {
                        Logger.debug('Autoplay', `Found Spotify Top Track fallback: ${t.title} by ${t.author}`);
                        t.requester = requester;
                        return t;
                    }
                }
            } catch (e) {
                Logger.warn('GuildSession', `Failed to fetch Spotify artist top tracks: ${e}`);
            }
        }

        // 3. YouTube Search Fallback Strategy (Tertiary Strategy)
        const node = this.client.shoukaku.options.nodeResolver(this.client.shoukaku.nodes);
        if (node) {
            const cleanAuthor = artist.replace(/ - Topic|VEVO|Official/gi, '').trim();

            // Search for general popular songs by the artist, NOT the specific title!
            const ytStrategies = [
                `ytsearch:${cleanAuthor} popular songs`,
                `ytsearch:${cleanAuthor} official music video`,
                `ytsearch:${cleanAuthor} full album tracks`,
                `ytsearch:popular music 2024`
            ];

            for (const query of ytStrategies) {
                try {
                    const result = await node.rest.resolve(query);
                    if (result && result.loadType === 'search' && Array.isArray(result.data)) {
                        // Shuffle the results to avoid always picking the same exact popular song
                        const shuffledTracks = [...result.data].sort(() => Math.random() - 0.5);
                        for (const track of shuffledTracks) {
                            if (
                                !track.info.isStream &&
                                track.info.length > 60000 &&   // Min 1 minute
                                track.info.length < 600000     // Max 10 minutes
                            ) {
                                if (!isDuplicateOrBad(track.info.title, track.info.uri!)) {
                                    Logger.debug('Autoplay', `Found YouTube fallback via strategy "${query}": ${track.info.title}`);
                                    return {
                                        encoded: track.encoded,
                                        title: track.info.title,
                                        author: track.info.author,
                                        uri: track.info.uri!,
                                        duration: track.info.length,
                                        artworkUrl: track.info.artworkUrl || undefined,
                                        sourceName: 'youtube',
                                        requester: requester
                                    };
                                }
                            }
                        }
                    }
                } catch (e) {
                    Logger.warn('GuildSession', `Autoplay YouTube fallback strategy failed (${query}): ${e}`);
                }
            }
        }

        // 4. Ultimate Fallback: Re-play an old track from history (Never let it stop)
        if (history.length > 5) {
            Logger.debug('Autoplay', 'All external strategies exhausted. Recycling old track from history to maintain continuous playback.');
            // Pick a track from the very bottom of the history
            const targetTrack = history[history.length - 1];
            if (targetTrack) {
                // Clear the URIs so isDuplicateOrBad ignores it in the future
                targetTrack.requester = requester;
                return targetTrack; // This violates duplicate check by design, as an absolute last resort.
            }
        }

        Logger.info('Autoplay', 'No suitable track found via any strategy, and history too short. Stopping.');
        return null;
    }

    async stop(): Promise<void> {
        this.clearIdleTimer();
        this.queue.clear();
        this.queue.loopMode = LoopMode.OFF;

        if (this.player) {
            await this.player.stopTrack();
        }

        await this.updateVoiceStatus('<:musicalnote:1474944534357082142> Use /play to play songs!');

        if (this._nowPlayingPanel) {
            await this._nowPlayingPanel.destroy();
        }
        this._nowPlayingPanel = null;

        // Reset idle timer to disconnect if inactive for too long
        this.resetIdleTimer();
    }

    async destroy(skipBackupClear = false): Promise<void> {
        if (this._destroying) return;
        this._destroying = true;

        this.clearIdleTimer();

        try {
            await this.updateVoiceStatus();
        } catch {
            // VC status update can fail if bot was kicked
        }

        if (this._nowPlayingPanel) {
            try {
                await this._nowPlayingPanel.destroy();
            } catch {
                // Panel cleanup can fail if channel deleted
            }
            this._nowPlayingPanel = null;
        }
        this.queue.destroy();

        // Clean up filter state to prevent memory leak
        this.client.filters.resetFilters(this.guildId);

        if (this.player) {
            await this.player.destroy();
            this.player = null;
        }

        // Force leave voice channel to prevent "existing connection" errors
        try {
            this.client.shoukaku.leaveVoiceChannel(this.guildId);
        } catch {
            Logger.debug('GuildSession', `Failed to leave VC for ${this.guildId} (may already be disconnected)`);
        }

        // Only clear persistence backup on normal user disconnects, NOT during bot shutdown/restart
        if (!skipBackupClear) {
            void this.client.queuePersistence.clearBackup(this.guildId);
        }

        this.client.music.destroySession(this.guildId);
    }

    private async autoResolveNext(): Promise<void> {
        const next = this.queue.next; // O(1) peek next instead of copying entire array
        if (next && next.unresolved && !next.encoded) {
            Logger.debug('GuildSession', `Pre-resolving next track: ${next.title}`);
            try {
                const resolved = await this.client.music.resolveTrack(next);
                if (resolved.encoded) {
                    next.encoded = resolved.encoded;
                    next.duration = resolved.duration;
                    Logger.debug('GuildSession', `Pre-resolved successfully: ${next.title}`);
                }
            } catch {
                Logger.debug('GuildSession', `Pre-resolve failed for: ${next.title}`);
            }
        }
    }


}
