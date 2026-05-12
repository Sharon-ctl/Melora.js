import type { MeloraClient } from '../core/Client.js';
import type { TrackInfo } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

interface CachedResolution {
    encoded: string;
    uri: string;
    duration: number;
    expiresAt: number;
}

interface ScoredCandidate {
    track: any; // Lavalink Track object
    score: number;
    reasons: string[];
}

// Variant keywords that should be rejected unless the original track contains them
const VARIANT_KEYWORDS = [
    'remix', 'live', 'cover', 'acoustic', 'slowed', 'reverb',
    'sped up', 'nightcore', 'daycore', 'karaoke', 'instrumental',
    'mashup', 'bass boosted', 'bass boost', '8d', '16d', '32d',
    'reaction', 'review', 'tiktok',
];

// Words stripped from titles before comparison
const NOISE_WORDS = /\(feat\..*?\)|\(ft\..*?\)|\[.*?\]|\(.*?official.*?\)|\(.*?video.*?\)|\(.*?audio.*?\)/gi;

export class SpotifyResolver {
    private readonly client: MeloraClient;

    // Cache: spotifyTrackId → resolved YouTube data
    private readonly cache = new Map<string, CachedResolution>();
    private readonly CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
    private readonly MAX_CACHE_SIZE = 2000;

    // Sweep stale cache entries every 10 minutes
    private readonly sweepTimer: ReturnType<typeof setInterval>;

    constructor(client: MeloraClient) {
        this.client = client;
        this.sweepTimer = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.cache) {
                if (entry.expiresAt <= now) this.cache.delete(key);
            }
        }, 600000);
    }

    /**
     * Resolve a Spotify track to a YouTube playable track.
     * Returns the track with `encoded`, `duration` populated and `unresolved = false`.
     */
    async resolve(track: TrackInfo, priority = false): Promise<TrackInfo> {
        if (!track.unresolved || track.encoded) return track;
        if (track.sourceName !== 'spotify') return track; // Not a Spotify track, skip

        // --- Cache lookup ---
        const cacheKey = this.getCacheKey(track);
        if (cacheKey) {
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                track.encoded = cached.encoded;
                track.duration = cached.duration;
                track.originalUri = track.originalUri || track.uri;
                track.unresolved = false;
                Logger.debug('SpotifyResolver', `Cache hit for "${track.title}" (${cacheKey})`);
                return track;
            }
        }

        const node = this.client.shoukaku.options.nodeResolver(this.client.shoukaku.nodes);
        if (!node) {
            Logger.warn('SpotifyResolver', 'No Lavalink node available for resolution');
            return track;
        }

        // --- Strategy 1: ISRC lookup (highest confidence) ---
        if (track.isrc) {
            try {
                const isrcResult = await this.timedResolve(node, `ytsearch:"${track.isrc}"`, 5000);
                if (isrcResult) {
                    const candidates = this.extractCandidates(isrcResult);
                    if (candidates.length > 0) {
                        // ISRC matches are trusted — score them but with a huge bonus
                        const scored = this.scoreCandidates(candidates, track);
                        if (scored.length > 0 && scored[0].score > 50) {
                            this.applyResolution(track, scored[0].track, cacheKey);
                            Logger.debug('SpotifyResolver', `Resolved "${track.title}" via ISRC (score: ${scored[0].score}, ${scored[0].reasons.join(', ')})`);
                            return track;
                        }
                    }
                }
            } catch {
                // ISRC timeout — continue to search strategies
            }
        }

        // --- Strategy 2: Multi-query search ---
        const queries = this.generateQueries(track);
        const allCandidates: any[] = [];

        for (const query of queries) {
            try {
                const result = await this.timedResolve(node, query, 8000);
                if (result) {
                    const candidates = this.extractCandidates(result);
                    allCandidates.push(...candidates);
                }
            } catch {
                // Timeout on individual query — try next
            }

            // If we already have enough candidates after first query, skip extras in non-priority mode
            if (!priority && allCandidates.length >= 10) break;
        }

        if (allCandidates.length === 0) {
            Logger.warn('SpotifyResolver', `No YouTube candidates found for "${track.title}" by ${track.author}`);
            return track;
        }

        // Deduplicate by video URI
        const seen = new Set<string>();
        const uniqueCandidates = allCandidates.filter(c => {
            const uri = c.info?.uri;
            if (!uri || seen.has(uri)) return false;
            seen.add(uri);
            return true;
        });

        // --- Score all candidates ---
        const scored = this.scoreCandidates(uniqueCandidates, track);

        if (scored.length === 0) {
            Logger.warn('SpotifyResolver', `All candidates rejected for "${track.title}" — no safe fallback`);
            return track;
        }

        const best = scored[0];
        this.applyResolution(track, best.track, cacheKey);

        Logger.debug('SpotifyResolver',
            `Resolved "${track.title}" → "${best.track.info.title}" (score: ${best.score}, ${best.reasons.slice(0, 4).join(', ')})`
        );

        return track;
    }

    /**
     * Batch resolve for playlists: resolve first N instantly, rest in background.
     */
    async resolveBatch(tracks: TrackInfo[], instantCount = 3): Promise<void> {
        // Resolve first N tracks immediately (blocking)
        const instant = tracks.slice(0, instantCount);
        await Promise.all(instant.map(t => this.resolve(t, true)));

        // Background resolve remaining — non-blocking
        const remaining = tracks.slice(instantCount);
        if (remaining.length > 0) {
            void this.resolveBackground(remaining);
        }
    }

    private async resolveBackground(tracks: TrackInfo[]): Promise<void> {
        for (const track of tracks) {
            try {
                await this.resolve(track, false);
            } catch (e) {
                Logger.debug('SpotifyResolver', `Background resolve failed for "${track.title}": ${e}`);
            }
            // Yield to event loop between resolutions
            await new Promise(r => setImmediate(r));
        }
    }

    // ================================================================
    // Query Generation
    // ================================================================

    /**
     * Generate 3 ranked search queries with different strategies.
     */
    private generateQueries(track: TrackInfo): string[] {
        const title = track.name || track.title;
        const cleanTitle = title.replace(NOISE_WORDS, '').trim();
        const primaryArtist = track.artists?.[0]?.name || track.author.split(',')[0].trim();
        const allArtists = track.artists?.map(a => a.name).join(' ') || track.author;

        const queries: string[] = [];

        // Query 1: Precise — clean title + primary artist + "audio"
        queries.push(`ytsearch:${cleanTitle} ${primaryArtist} audio`);

        // Query 2: Broader — full title + all artists (no "audio" suffix)
        queries.push(`ytsearch:${title} ${allArtists}`);

        // Query 3: Album-aware — title + primary artist + album name
        if (track.albumName && track.albumName !== title) {
            queries.push(`ytsearch:${cleanTitle} ${primaryArtist} ${track.albumName}`);
        } else {
            // Fallback: title + artist + "official"
            queries.push(`ytsearch:${cleanTitle} ${primaryArtist} official`);
        }

        return queries;
    }

    // ================================================================
    // Scoring Engine
    // ================================================================

    /**
     * Score YouTube candidates against Spotify metadata.
     * Returns sorted array (highest score first), excluding scores <= 0.
     */
    private scoreCandidates(candidates: any[], track: TrackInfo): ScoredCandidate[] {
        const results: ScoredCandidate[] = [];
        const originalTitle = (track.name || track.title).toLowerCase();
        const cleanOriginal = originalTitle.replace(NOISE_WORDS, '').replace(/[^a-z0-9\s]/g, '').trim();
        const originalWords = cleanOriginal.split(/\s+/).filter(w => w.length > 2);
        const targetDuration = track.duration;
        const allArtists = track.artists?.map(a => a.name.toLowerCase()) || [track.author.toLowerCase()];

        for (const candidate of candidates) {
            const info = candidate.info;
            if (!info) continue;

            // Skip streams immediately
            if (info.isStream) continue;

            let score = 100;
            const reasons: string[] = [];

            const cTitle = (info.title || '').toLowerCase();
            const cAuthor = (info.author || '').toLowerCase();
            const cClean = cTitle.replace(NOISE_WORDS, '').replace(/[^a-z0-9\s]/g, '').trim();

            // === POSITIVE SIGNALS ===

            // Title matching
            if (cClean.includes(cleanOriginal) || cleanOriginal.includes(cClean)) {
                score += 30;
                reasons.push('+30 exact_title');
            } else {
                // Partial word matching
                const matchedWords = originalWords.filter(w => cTitle.includes(w));
                const matchRatio = originalWords.length > 0 ? matchedWords.length / originalWords.length : 0;
                
                if (originalWords.length === 0) {
                    score -= 100;
                    reasons.push('-100 totally_wrong_title');
                } else if (matchRatio === 0) {
                    score -= 100;
                    reasons.push('-100 totally_wrong_title');
                } else if (matchRatio >= 0.8) {
                    score += 15;
                    reasons.push('+15 partial_title');
                } else if (matchRatio < 0.5) {
                    score -= 60;
                    reasons.push('-60 title_mismatch');
                }
            }

            // Artist in video title
            if (allArtists.some(a => cTitle.includes(a))) {
                score += 25;
                reasons.push('+25 artist_in_title');
            }

            // Artist in channel name
            if (allArtists.some(a => cAuthor.includes(a))) {
                score += 20;
                reasons.push('+20 artist_channel');
            }

            // Topic channel (auto-generated official audio — highest trust)
            if (cAuthor.includes('- topic')) {
                score += 30;
                reasons.push('+30 topic_channel');
            }

            // VEVO channel
            if (cAuthor.includes('vevo')) {
                score += 15;
                reasons.push('+15 vevo');
            }

            // Duration scoring
            const durationDiff = Math.abs(info.length - targetDuration);
            if (durationDiff <= 3000) {
                score += 25;
                reasons.push('+25 dur_±3s');
            } else if (durationDiff <= 5000) {
                score += 15;
                reasons.push('+15 dur_±5s');
            } else if (durationDiff <= 10000) {
                score += 5;
                reasons.push('+5 dur_±10s');
            } else if (durationDiff > 60000) {
                score -= 80;
                reasons.push('-80 dur_>60s');
            } else if (durationDiff > 30000) {
                score -= 50;
                reasons.push('-50 dur_>30s');
            }

            // === NEGATIVE SIGNALS (variant filtering) ===
            for (const keyword of VARIANT_KEYWORDS) {
                // Only penalize if the original track doesn't contain the keyword
                if (originalTitle.includes(keyword)) continue;

                const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
                if (regex.test(cTitle)) {
                    // Severity varies by keyword
                    const penalty = ['remix', 'live', 'cover'].includes(keyword) ? -40
                        : ['slowed', 'reverb', 'sped up', 'nightcore', 'daycore'].includes(keyword) ? -30
                        : ['karaoke', 'instrumental'].includes(keyword) ? -25
                        : -20;
                    score += penalty;
                    reasons.push(`${penalty} ${keyword}`);
                }
            }

            // "lyrics" in title (lyric videos often have text overlays, not official audio)
            if (/\blyrics?\b/i.test(cTitle) && !originalTitle.includes('lyric')) {
                score -= 25;
                reasons.push('-25 lyrics_video');
            }

            // Only keep candidates with positive scores
            if (score > 0) {
                results.push({ track: candidate, score, reasons });
            }
        }

        // Sort highest score first
        results.sort((a, b) => b.score - a.score);
        return results;
    }

    // ================================================================
    // Utilities
    // ================================================================

    private applyResolution(track: TrackInfo, youtubeTrack: any, cacheKey: string | null): void {
        track.encoded = youtubeTrack.encoded;
        track.originalUri = track.originalUri || track.uri;
        track.duration = youtubeTrack.info.length;
        track.unresolved = false;

        // Cache the resolution
        if (cacheKey && youtubeTrack.encoded) {
            if (this.cache.size >= this.MAX_CACHE_SIZE) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey) this.cache.delete(firstKey);
            }
            this.cache.set(cacheKey, {
                encoded: youtubeTrack.encoded,
                uri: youtubeTrack.info.uri || '',
                duration: youtubeTrack.info.length,
                expiresAt: Date.now() + this.CACHE_TTL,
            });
        }
    }

    /**
     * Generate a stable cache key from Spotify track data.
     * Prefers Spotify track ID extracted from URI, falls back to title+author hash.
     */
    private getCacheKey(track: TrackInfo): string | null {
        // Try to extract Spotify track ID from URI
        const match = track.uri?.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/);
        if (match) return `sp:${match[1]}`;

        // Fallback: title+author
        if (track.title && track.author) {
            return `sp:${track.title.toLowerCase()}:${track.author.toLowerCase()}`;
        }

        return null;
    }

    private async timedResolve(node: any, query: string, timeoutMs: number): Promise<any | null> {
        try {
            const result = await Promise.race([
                node.rest.resolve(query),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Resolve timeout')), timeoutMs)),
            ]);
            return result;
        } catch {
            return null;
        }
    }

    private extractCandidates(result: any): any[] {
        if (!result || result.loadType === 'empty' || result.loadType === 'error') return [];
        if (result.loadType === 'playlist') return result.data?.tracks || [];
        if (result.loadType === 'search') return Array.isArray(result.data) ? result.data : [];
        if (result.loadType === 'track') return result.data ? [result.data] : [];
        return Array.isArray(result.data) ? result.data : [result.data];
    }

    /** Cache statistics for monitoring */
    getCacheStats(): { size: number; maxSize: number } {
        return { size: this.cache.size, maxSize: this.MAX_CACHE_SIZE };
    }

    destroy(): void {
        clearInterval(this.sweepTimer);
        this.cache.clear();
    }
}
