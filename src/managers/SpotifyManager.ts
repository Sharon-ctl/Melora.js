import { Logger } from '../utils/Logger.js';
import type { TrackInfo } from '../types/index.js';
import { type User } from 'discord.js';

export type SpotifyResult =
    | { type: 'track'; tracks: TrackInfo[] }
    | { type: 'playlist'; name: string; tracks: TrackInfo[]; artwork?: string }
    | { type: 'album'; name: string; tracks: TrackInfo[]; artwork?: string }
    | { type: 'error'; tracks: [] }
    | { type: 'none'; tracks: [] };

export class SpotifyManager {
    private clientId = process.env.SPOTIFY_CLIENT_ID || '';
    private clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    private readonly playlistCache = new Map<string, { result: SpotifyResult, expiresAt: number }>();
    private readonly albumCache = new Map<string, { result: SpotifyResult, expiresAt: number }>();
    private readonly SPOTIFY_CACHE_TTL = 60 * 60 * 1000; // 1 hour
    private readonly MAX_CACHE_SIZE = 100;

    constructor() {
        if (!this.clientId || !this.clientSecret) {
            Logger.warn('SpotifyManager', 'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env. Spotify Web API integration will fail.');
        }
    }

    private async getAccessToken(): Promise<string | null> {
        if (this.accessToken && Date.now() < this.tokenExpiresAt) {
            return this.accessToken;
        }

        if (!this.clientId || !this.clientSecret) return null;

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({ grant_type: 'client_credentials' })
            });

            if (!response.ok) {
                Logger.error('SpotifyManager', `Failed to fetch access token: ${response.statusText}`);
                return null;
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000; // Subtract 1 min for safety
            return this.accessToken;
        } catch (error) {
            Logger.error('SpotifyManager', `Error fetching access token: ${error}`);
            return null;
        }
    }

    private async fetchApi(endpoint: string): Promise<any> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('No access token available');

        const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Spotify API Error: ${response.status} ${response.statusText}`);
        return response.json();
    }

    private parseUrl(url: string): { type: string; id: string } | null {
        const match = url.match(/spotify\.com\/(?:intl-[a-z]{2}\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (match) return { type: match[1], id: match[2] };
        return null;
    }

    async resolve(url: string, requester: User): Promise<SpotifyResult> {
        try {
            const parsed = this.parseUrl(url);
            if (!parsed) return { type: 'none', tracks: [] };

            if (parsed.type === 'track') return await this.resolveTrack(parsed.id, url, requester);
            if (parsed.type === 'playlist') return await this.resolvePlaylist(parsed.id, url, requester);
            if (parsed.type === 'album') return await this.resolveAlbum(parsed.id, url, requester);

            return { type: 'none', tracks: [] };
        } catch (error) {
            Logger.error('SpotifyManager', `Failed to resolve ${url}: ${error}`);
            return { type: 'error', tracks: [] };
        }
    }

    private extractTrack(t: any, url: string, requester: User | { id: string; username: string }): TrackInfo {
        const artists = t.artists?.map((a: any) => ({ name: a.name, id: a.id })) || [];
        const authorString = artists.length > 0 ? artists.map((a: any) => a.name).join(', ') : 'Unknown Artist';

        return {
            encoded: null,
            title: t.name || 'Unknown Track',
            author: authorString,
            uri: t.external_urls?.spotify || url,
            duration: t.duration_ms || 180000,
            requester: { id: requester.id, username: ('username' in requester ? requester.username : '') as string },
            artworkUrl: t.album?.images?.[0]?.url,
            sourceName: 'spotify',
            unresolved: true,
            name: t.name,
            artists: artists.length > 0 ? artists : undefined,
            isrc: t.external_ids?.isrc,
            albumName: t.album?.name,
            releaseYear: t.album?.release_date ? parseInt(t.album.release_date.substring(0, 4), 10) : undefined,
            explicit: t.explicit === true || undefined,
        };
    }

    async resolveTrack(id: string, url: string, requester: User): Promise<SpotifyResult> {
        try {
            const trackData = await this.fetchApi(`/tracks/${id}`);
            const track = this.extractTrack(trackData, url, requester);
            return { type: 'track', tracks: [track] };
        } catch (error) {
            Logger.error('SpotifyManager', `Error resolving track ${url}: ${error}`);
            return { type: 'error', tracks: [] };
        }
    }

    async resolvePlaylist(id: string, url: string, requester: User): Promise<SpotifyResult> {
        const cached = this.playlistCache.get(url);
        if (cached && Date.now() < cached.expiresAt && cached.result.type === 'playlist') {
            const freshTracks = cached.result.tracks.map(t => ({ ...t, requester: { id: requester.id, username: requester.username } }));
            return { type: 'playlist', tracks: freshTracks, name: cached.result.name };
        }

        try {
            const playlistData = await this.fetchApi(`/playlists/${id}`);
            const playlistName = playlistData.name || 'Spotify Playlist';
            const customThumbnail = playlistData.images?.[0]?.url;

            const tracks: TrackInfo[] = [];

            for (const item of playlistData.tracks.items) {
                if (!item.track) continue;
                const track = this.extractTrack(item.track, item.track.external_urls?.spotify || url, requester);
                track.playlistName = playlistName;
                if (!track.artworkUrl && customThumbnail) track.artworkUrl = customThumbnail;
                tracks.push(track);
            }

            let nextUrl = playlistData.tracks.next;
            while (nextUrl) {
                const endpoint = nextUrl.replace('https://api.spotify.com/v1', '');
                const pageData = await this.fetchApi(endpoint);

                for (const item of pageData.items) {
                    if (!item.track) continue;
                    const track = this.extractTrack(item.track, item.track.external_urls?.spotify || url, requester);
                    track.playlistName = playlistName;
                    if (!track.artworkUrl && customThumbnail) track.artworkUrl = customThumbnail;
                    tracks.push(track);
                }

                nextUrl = pageData.next;
            }

            const result: SpotifyResult = { type: 'playlist', tracks, name: playlistName, artwork: customThumbnail };

            if (tracks.length > 0) {
                if (this.playlistCache.size >= this.MAX_CACHE_SIZE) {
                    const firstKey = this.playlistCache.keys().next().value;
                    if (firstKey) this.playlistCache.delete(firstKey);
                }
                this.playlistCache.set(url, { result, expiresAt: Date.now() + this.SPOTIFY_CACHE_TTL });
            }

            return result;
        } catch (error) {
            Logger.error('SpotifyManager', `Error resolving playlist ${url}: ${error}`);
            return { type: 'error', tracks: [] };
        }
    }

    async resolveAlbum(id: string, url: string, requester: User): Promise<SpotifyResult> {
        const cached = this.albumCache.get(url);
        if (cached && Date.now() < cached.expiresAt && cached.result.type === 'album') {
            const freshTracks = cached.result.tracks.map(t => ({ ...t, requester: { id: requester.id, username: requester.username } }));
            return { type: 'album', tracks: freshTracks, name: cached.result.name };
        }

        try {
            const albumData = await this.fetchApi(`/albums/${id}`);
            const albumName = albumData.name || 'Spotify Album';
            const customThumbnail = albumData.images?.[0]?.url;
            const releaseYear = albumData.release_date ? parseInt(albumData.release_date.substring(0, 4), 10) : undefined;

            const tracks: TrackInfo[] = [];

            for (const item of albumData.tracks.items) {
                item.album = albumData;
                const track = this.extractTrack(item, item.external_urls?.spotify || url, requester);
                track.albumName = albumName;
                track.releaseYear = releaseYear;
                if (!track.artworkUrl && customThumbnail) track.artworkUrl = customThumbnail;
                tracks.push(track);
            }

            let nextUrl = albumData.tracks.next;
            while (nextUrl) {
                const endpoint = nextUrl.replace('https://api.spotify.com/v1', '');
                const pageData = await this.fetchApi(endpoint);

                for (const item of pageData.items) {
                    item.album = albumData;
                    const track = this.extractTrack(item, item.external_urls?.spotify || url, requester);
                    track.albumName = albumName;
                    track.releaseYear = releaseYear;
                    if (!track.artworkUrl && customThumbnail) track.artworkUrl = customThumbnail;
                    tracks.push(track);
                }
                nextUrl = pageData.next;
            }

            const result: SpotifyResult = { type: 'album', tracks, name: albumName, artwork: customThumbnail };

            if (tracks.length > 0) {
                if (this.albumCache.size >= this.MAX_CACHE_SIZE) {
                    const firstKey = this.albumCache.keys().next().value;
                    if (firstKey) this.albumCache.delete(firstKey);
                }
                this.albumCache.set(url, { result, expiresAt: Date.now() + this.SPOTIFY_CACHE_TTL });
            }

            return result;
        } catch (error) {
            Logger.error('SpotifyManager', `Error resolving album ${url}: ${error}`);
            return { type: 'error', tracks: [] };
        }
    }

    async getRecommendations(_options?: { seed_tracks?: string[]; seed_artists?: string[]; seed_genres?: string[] }): Promise<TrackInfo[]> {
        return [];
    }

    async getArtistTopTracks(_artistId: string): Promise<TrackInfo[]> {
        return [];
    }

    async getUserTopTracks(_accessToken: string, _limit?: number): Promise<string[]> {
        return [];
    }

    async search(_query: string, _limit?: number): Promise<TrackInfo[]> {
        return [];
    }
}
