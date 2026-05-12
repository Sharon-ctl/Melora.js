import 'dotenv/config';

export interface LavalinkNodeConfig {
    name: string;
    url: string;
    auth: string;
}

export interface BotConfig {
    token: string;
    ownerId: string;
    useJsonFallback: boolean; // Kept for compat, but effectively always true now
    lavalinkNodes: LavalinkNodeConfig[];
    logLevel: 'info' | 'warn' | 'error' | 'debug';
    logToFile: boolean;
    idleTimeoutMs: number;
    spotifyClientId: string;
    spotifyClientSecret: string;
    geniusAccessToken: string;
    bannedKeywords: string[];
}

function parseLavalinkNodes(raw: string): LavalinkNodeConfig[] {
    return raw.split(',').map((entry) => {
        const [name, host, port, password] = entry.trim().split('|');
        if (!name || !host || !port || !password) {
            throw new Error(`Invalid Lavalink node format: "${entry}". Expected: name|host|port|password`);
        }
        return { name, url: `${host}:${port}`, auth: password };
    });
}

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export const config: BotConfig = {
    token: requireEnv('DISCORD_TOKEN'),
    ownerId: requireEnv('BOT_OWNER_ID'),
    useJsonFallback: true,
    lavalinkNodes: parseLavalinkNodes(requireEnv('LAVALINK_NODES')),
    logLevel: (process.env['LOG_LEVEL'] as BotConfig['logLevel']) ?? 'info',
    logToFile: process.env['LOG_TO_FILE'] === 'true',
    idleTimeoutMs: parseInt(process.env['IDLE_TIMEOUT_MS'] ?? '300000', 10), // 5 min default
    spotifyClientId: process.env['SPOTIFY_CLIENT_ID'] ?? '',
    spotifyClientSecret: process.env['SPOTIFY_CLIENT_SECRET'] ?? '',
    geniusAccessToken: process.env['GENIUS_ACCESS_TOKEN'] ?? '',
    bannedKeywords: [
        '8d', '16d', '32d', 'bass boosted', 'bass boost',
        'slowed', 'reverb', 'nightcore', 'daycore',
        'karaoke', 'instrumental', 'remix', 'cover', 'live',
        'reaction', 'review', 'mashup'
    ],
};
