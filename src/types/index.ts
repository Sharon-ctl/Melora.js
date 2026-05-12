import {
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    SlashCommandBuilder,
    type SlashCommandOptionsOnlyBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { MeloraClient } from '../core/Client.js';

export enum PermissionLevel {
    USER = 0,
    DJ_ROLE = 1,
    GUILD_ADMIN = 2,
    BOT_OWNER = 3,
}

export enum LoopMode {
    OFF = 'off',
    TRACK = 'track',
    QUEUE = 'queue',
    AUTOPLAY = 'autoplay',
}

export interface SlashCommand {
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
    permissionLevel: PermissionLevel;
    cooldown?: number;
    middleware?: MiddlewareFunction[];
    category?: string;
    execute: (interaction: ChatInputCommandInteraction, client: MeloraClient) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, client: MeloraClient) => Promise<void>;
}

export type MiddlewareFunction = (
    interaction: ChatInputCommandInteraction,
    client: MeloraClient,
) => Promise<boolean>;

export interface TrackInfo {
    encoded: string | null;
    title: string;
    author: string;
    uri: string;
    duration: number;
    artworkUrl?: string;
    sourceName?: string;
    requester: {
        id: string;
        username: string;
    };
    unresolved?: boolean;
    // Optional metadata for better resolution
    name?: string;
    artists?: { name: string; id?: string }[];
    playlistName?: string;
    originalUri?: string; // Preserved original URI (e.g. Spotify) before resolution overwrites to YouTube
    dedicateTo?: {
        id: string;
        username: string;
    };
    dedicateNote?: string; // Custom message for the dedication
    isrc?: string; // International Standard Recording Code for foolproof YouTube matching
    albumName?: string;
    releaseYear?: number;
    explicit?: boolean;
}

export interface MusicSearchResult {
    type: 'track' | 'playlist' | 'search';
    tracks: TrackInfo[];
    playlistName?: string;
    playlistArtwork?: string;
}

export interface GuildSettingsData {
    guildId: string;
    djRoleId: string | null;
    djOnly: boolean;
    restricted: boolean;
    volumeLimit: number;
    maxDuration: number;
    maxQueueSize: number;
    musicChannelId: string | null;
    defaultVolume: number;
    roleMappings?: Record<string, string[]>; // e.g. { "admin": ["roleId1"], "dj": ["roleId2"] }
    commandToggles?: Record<string, boolean>; // e.g. { "play": true, "dj": false }
    restrictedChannels?: string[];
    shieldSettings?: {
        antiSpamEnabled: boolean;
        antiScamEnabled: boolean;
        lockdownEnabled: boolean;
    };
    cooldownSettings?: Record<string, number>;
    maintenanceEnabled?: boolean;
    loggingChannelId?: string | null;
}

export interface UserStatsData {
    userId: string;
    guildId: string;
    tracksPlayed: number;
    totalListenTime: number;
    lastPlayed: number;
}

export interface PlaylistData {
    id: string;
    userId: string;
    name: string;
    tracks: TrackInfo[];
    editors?: string[];
    createdAt: number;
    updatedAt: number;
}

export interface SpotifyTokenData {
    userId: string;
    refreshToken: string;
}

export interface PlayHistoryEntry {
    userId: string;
    guildId: string;
    trackTitle: string;
    trackAuthor: string;
    trackUri: string;
    duration: number;
    timestamp: number;
}

export interface BlacklistEntry {
    targetId: string;
    targetType: 'user' | 'guild';
    reason: string;
    addedAt: number;
}

export interface UserData {
    [key: string]: unknown;
    userId: string;
    spotifyId?: string;
    refreshToken?: string;
    spotifyDisconnected: boolean;
}

export interface TrackStats {
    playCount: number;
    completedCount: number;
    skipCount: number;
    loopCount: number;
    lastPlayed: number;
    trackTitle?: string;
    trackAuthor?: string;
    timeBuckets: {
        morning: number; // 6:00 - 11:59
        afternoon: number; // 12:00 - 17:59
        night: number; // 18:00 - 5:59
    };
}

export interface UserPlayData {
    [key: string]: unknown;
    userId: string;
    tracks: Record<string, TrackStats>; // Key is track URI
}

export const DEFAULT_GUILD_SETTINGS: Omit<GuildSettingsData, 'guildId'> = {
    djRoleId: null,
    djOnly: false,
    restricted: false,
    volumeLimit: 100,
    maxDuration: 3600000,
    maxQueueSize: 500,
    musicChannelId: null,
    defaultVolume: 100,
    roleMappings: {},
    commandToggles: {},
    restrictedChannels: [],
    shieldSettings: {
        antiSpamEnabled: true,
        antiScamEnabled: false,
        lockdownEnabled: false,
    },
    cooldownSettings: {},
    maintenanceEnabled: false,
    loggingChannelId: null,
};

export interface FavoritesData {
    userId: string;
    tracks: TrackInfo[];
}

export interface EqPresetData {
    userId: string;
    name: string;
    bands: number[];
}

export interface SessionBackup {
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
    currentTrack: TrackInfo | null;
    queue: TrackInfo[];
    volume: number;
    loopMode: LoopMode;
    is247: boolean;
    savedAt: number;
}
