import { type ChatInputCommandInteraction, PermissionFlagsBits, type GuildMember, type Guild, type User, type Message } from 'discord.js';
import type { MeloraClient } from '../core/Client.js';
import { PermissionLevel, type GuildSettingsData } from '../types/index.js';
import { config } from '../config/config.js';

export interface GuardOptions {
    member?: GuildMember | null;
    guild?: Guild | null;
    user: User;
    commandName?: string;
    source: 'slash' | 'prefix' | 'button' | 'modal' | 'select' | 'request_channel';
    interaction?: ChatInputCommandInteraction | any;
    message?: Message;
    context?: {
        requiresVoice?: boolean;
        requiresQueue?: boolean;
        dangerous?: boolean;
        requiredRole?: string;
        requiredDiscordPerms?: bigint[];
    };
}

export interface GuardResult {
    allowed: boolean;
    reason?: string;
    code?: string;
    missingDiscordPerms?: string[];
    missingMeloraRoles?: string[];
    requiresConfirmation?: boolean;
    cooldownRemaining?: number;
}

export class PermissionManager {
    private readonly client: MeloraClient;

    constructor(client: MeloraClient) {
        this.client = client;
    }

    async guard(options: GuardOptions): Promise<GuardResult> {
        const { member, guild, user, commandName, context } = options;

        // E. Abuse Protection: Blacklisted users/guilds
        if (await this.isBlacklisted(user.id, 'user')) {
            return { allowed: false, reason: 'You are blacklisted from using this service.', code: 'BLACKLISTED_USER' };
        }
        if (guild && await this.isBlacklisted(guild.id, 'guild')) {
            return { allowed: false, reason: 'This server is blacklisted from using this service.', code: 'BLACKLISTED_GUILD' };
        }

        // C. Runtime Context: Maintenance mode
        let settings: GuildSettingsData | undefined;
        if (guild) {
            settings = await this.client.settings.getSettings(guild.id);
            if (settings.maintenanceEnabled && !this.isOwner(user.id)) {
                return { allowed: false, reason: 'This server is currently in maintenance mode.', code: 'MAINTENANCE_MODE' };
            }
            if (settings.shieldSettings?.lockdownEnabled && !this.isAdmin(member)) {
                return { allowed: false, reason: 'This server is in lockdown mode.', code: 'LOCKDOWN_MODE' };
            }
            if (commandName && settings.commandToggles?.[commandName] === false) {
                return { allowed: false, reason: 'This command is disabled in this server.', code: 'COMMAND_DISABLED' };
            }
            // Check restricted channels
            const channelId = options.interaction?.channelId || options.message?.channelId;
            if (settings.restrictedChannels?.length && channelId && !settings.restrictedChannels.includes(channelId) && !this.isAdmin(member)) {
                return { allowed: false, reason: 'Commands cannot be used in this channel.', code: 'RESTRICTED_CHANNEL' };
            }
        }

        if (context) {
            // A. Discord Native Permissions
            if (context.requiredDiscordPerms && context.requiredDiscordPerms.length > 0 && member) {
                const missing = context.requiredDiscordPerms.filter(p => !member.permissions.has(p));
                if (missing.length > 0) {
                    return { allowed: false, reason: 'You lack required Discord permissions.', missingDiscordPerms: missing.map(String) };
                }
            }

            // B. Melora Role Access
            if (context.requiredRole && guild && member) {
                if (context.requiredRole === 'owner' && !this.isOwner(user.id)) {
                    return { allowed: false, reason: 'only can be viewed by Sharon', missingMeloraRoles: ['owner'] };
                }
                if (context.requiredRole === 'admin' && !this.isAdmin(member)) {
                    return { allowed: false, reason: 'You must be a server admin.', missingMeloraRoles: ['admin'] };
                }
                if (context.requiredRole === 'dj' && !(await this.isDJ(member, settings))) {
                    return { allowed: false, reason: 'This command requires **DJ** permission level.', missingMeloraRoles: ['dj'] };
                }
            }

            // C. Voice/Queue requirements
            if (context.requiresVoice) {
                if (!member?.voice?.channel) {
                    return { allowed: false, reason: 'join the active voice channel first', code: 'VOICE_REQUIRED' };
                }
                if (guild) {
                    const botMember = await guild.members.fetch(this.client.user?.id || '');
                    if (botMember?.voice?.channel && botMember.voice.channel.id !== member.voice.channel.id) {
                        return { allowed: false, reason: 'You must be in the same voice channel as me.', code: 'SAME_VOICE_REQUIRED' };
                    }
                }
            }

            if (context.requiresQueue && guild) {
                const session = this.client.music.getSession(guild.id);
                if (!session || (!session.isPlaying && session.queue.size === 0)) {
                    return { allowed: false, reason: 'a queue is required before using this command', code: 'QUEUE_REQUIRED' };
                }
            }

            // D. Risk Actions
            if (context.dangerous) {
                return { allowed: true, requiresConfirmation: true };
            }
        }

        return { allowed: true };
    }

    isOwner(userId: string): boolean {
        return userId === config.ownerId;
    }

    isAdmin(member?: GuildMember | null): boolean {
        if (!member) return false;
        return member.permissions.has(PermissionFlagsBits.Administrator);
    }

    async isDJ(member: GuildMember | null | undefined, settings?: GuildSettingsData): Promise<boolean> {
        if (!member) return false;
        if (this.isAdmin(member) || this.isOwner(member.id)) return true;
        if (!settings && member.guild) {
            settings = await this.client.settings.getSettings(member.guild.id);
        }
        if (!settings) return false;

        // Role mapping check
        if (settings.roleMappings?.['dj']) {
            const hasMappedDj = settings.roleMappings['dj'].some(id => member.roles.cache.has(id));
            if (hasMappedDj) return true;
        }

        if (settings.djRoleId && member.roles.cache.has(settings.djRoleId)) {
            return true;
        }

        if (!settings.djRoleId && !settings.djOnly && !settings.restricted && !settings.roleMappings?.['dj']?.length) {
            return true;
        }

        return false;
    }

    private async isBlacklisted(targetId: string, type: 'user' | 'guild'): Promise<boolean> {
        const entries = await this.client.database.getAll<import('../types/index.js').BlacklistEntry>('blacklist');
        return entries.some(e => e.targetId === targetId && e.targetType === type);
    }

    // Keep backwards compatibility for existing middleware briefly if needed
    async getUserLevel(interaction: ChatInputCommandInteraction): Promise<PermissionLevel> {
        if (this.isOwner(interaction.user.id)) return PermissionLevel.BOT_OWNER;
        const member = interaction.member as GuildMember | null;
        if (!member) return PermissionLevel.USER;
        if (this.isAdmin(member)) return PermissionLevel.GUILD_ADMIN;
        if (await this.isDJ(member)) return PermissionLevel.DJ_ROLE;
        return PermissionLevel.USER;
    }

    async hasPermission(interaction: ChatInputCommandInteraction, required: PermissionLevel): Promise<boolean> {
        if (required === PermissionLevel.DJ_ROLE && interaction.guildId) {
            const member = interaction.member as GuildMember | null;
            if (await this.isDJ(member)) return true;
            
            const settings = await this.client.settings.getSettings(interaction.guildId);
            if (!settings.djRoleId && !settings.djOnly && !settings.restricted) {
                return true;
            }
            return false;
        }

        const level = await this.getUserLevel(interaction);
        return level >= required;
    }

    async isDj(interaction: ChatInputCommandInteraction): Promise<boolean> {
        return this.isDJ(interaction.member as GuildMember | null);
    }
}
