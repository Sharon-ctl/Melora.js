import { Client, Collection, GatewayIntentBits, ActivityType } from 'discord.js';
import { Shoukaku, Connectors } from 'shoukaku';
import { config } from '../config/config.js';
import { Logger } from '../utils/Logger.js';
import { MusicManager } from '../managers/MusicManager.js';
import { PermissionManager } from '../managers/PermissionManager.js';
import { SettingsManager } from '../managers/SettingsManager.js';
import { PlaylistManager } from '../managers/PlaylistManager.js';
import { FilterManager } from '../managers/FilterManager.js';

import { Database } from '../database/Database.js';
import { QueuePersistenceService } from '../services/QueuePersistenceService.js';
import { FavoritesRepo } from '../database/repositories/FavoritesRepo.js';
import { PlayHistoryRepo } from '../database/repositories/PlayHistoryRepo.js';
import type { SlashCommand } from '../types/index.js';

export class MeloraClient extends Client {
    readonly commands = new Collection<string, SlashCommand>();
    readonly shoukaku: Shoukaku;
    readonly database: Database;
    readonly music: MusicManager;
    readonly permissions: PermissionManager;
    readonly settings: SettingsManager;
    readonly playlists: PlaylistManager;
    readonly filters: FilterManager;
    readonly queuePersistence: QueuePersistenceService;
    readonly favorites: FavoritesRepo;
    readonly playHistory: PlayHistoryRepo;

    readonly startedAt: number = Date.now();

    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
            ],
        });

        const nodes = config.lavalinkNodes.map((n) => ({
            name: n.name,
            url: n.url,
            auth: n.auth,
        }));

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this), nodes, {
            moveOnDisconnect: true,
            resume: true,
            resumeTimeout: 60,
            reconnectTries: 25,
            reconnectInterval: 3000,
            userAgent: 'Melora/2.0.0 (DiscordBot)',
            voiceConnectionTimeout: 30000,
        });

        this.database = new Database();
        this.music = new MusicManager(this);
        this.permissions = new PermissionManager(this);
        this.settings = new SettingsManager(this);
        this.playlists = new PlaylistManager(this);
        this.filters = new FilterManager(this);
        this.queuePersistence = new QueuePersistenceService(this);
        this.favorites = new FavoritesRepo(this.database);
        this.playHistory = new PlayHistoryRepo(this.database);

    }

    async start(): Promise<void> {
        Logger.info('Client', 'Initializing Melora v2...');
        await this.database.initialize();
        Logger.info('Client', 'Database initialized');

        await this.settings.initialize();
        Logger.info('Client', 'Settings cache initialized');

        await this.login(config.token);
        Logger.info('Client', 'Logged in to Discord');

        // Populate cached counts once guild cache is ready (login resolves before ready)
        this.once('ready', () => {
            this._cachedUserCount = this.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
            this._cachedServerCount = this.guilds.cache.size;
            Logger.info('Client', `Cached ${this._cachedUserCount} users across ${this._cachedServerCount} servers`);
        });

        // Update cached counts on guild changes
        this.on('guildCreate', (guild) => {
            this._cachedUserCount += (guild.memberCount || 0);
            this._cachedServerCount++;
        });
        this.on('guildDelete', (guild) => {
            this._cachedUserCount -= (guild.memberCount || 0);
            this._cachedServerCount--;
        });

        this.initActivity();
    }

    private _cachedUserCount = 0;
    private _cachedServerCount = 0;

    private initActivity(): void {
        let index = 0;
        setInterval(() => {
            let listeningUsers = 0;
            for (const session of this.music.getAllSessions()) {
                if (session.voiceChannel) {
                    listeningUsers += session.voiceChannel.members.filter(m => !m.user.bot).size;
                }
            }

            const activities = [
                `${this._cachedUserCount} Users`,
                `${this._cachedServerCount} Servers`,
                `Connected to ${this.music.getActiveSessions()} VC's`,
                `${listeningUsers} Current Listeners`,
                `use /help`,
                `7Flow Creation`
            ];

            this.user?.setActivity({ name: activities[index], type: ActivityType.Listening });
            index = (index + 1) % activities.length;
        }, 15000);
    }
}
