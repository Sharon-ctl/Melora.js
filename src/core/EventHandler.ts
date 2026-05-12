import { Events, type Interaction, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import type { MeloraClient } from './Client.js';
import { Logger } from '../utils/Logger.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { CooldownMiddleware } from '../middleware/CooldownMiddleware.js';
import { RateLimiter } from '../middleware/RateLimiter.js';
import { GlobalRateLimiter } from '../middleware/GlobalRateLimiter.js';
import { config } from '../config/config.js';

export class EventHandler {
    private readonly client: MeloraClient;
    private readonly cooldownMiddleware = new CooldownMiddleware();
    private readonly rateLimiter = new RateLimiter();
    private readonly emptyVcTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(client: MeloraClient) {
        this.client = client;
    }

    registerAll(): void {
        this.registerDiscordEvents();
        this.registerShoukakuEvents();
    }

    private registerDiscordEvents(): void {
        this.client.once(Events.ClientReady, (ready) => {
            Logger.info('Client', `Ready as ${ready.user.tag} | ${ready.guilds.cache.size} guilds`);
        });

        this.client.on(Events.InteractionCreate, (interaction) => {
            void this.handleInteraction(interaction);
        });

        this.client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot) return;

            if (message.mentions.has(this.client.user!.id) && message.content.trim().match(new RegExp(`^<@!?${this.client.user!.id}>$`))) {
                await message.reply("What? just use `/play` or `/help`. Dont bother me!!").catch(() => {});
            }
        });

        this.client.on(Events.GuildDelete, (guild) => {
            this.client.music.destroySession(guild.id);
        });

        this.client.on(Events.GuildCreate, async (guild) => {
            let ownerName = guild.ownerId;
            try {
                const owner = await guild.fetchOwner();
                ownerName = owner.user.username;
            } catch {
                // Fallback to ID if fetch fails
            }

            let inviterName = 'Unknown';
            try {
                const { AuditLogEvent } = await import('discord.js');
                const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 }).catch(() => null);
                if (auditLogs && auditLogs.entries.size > 0) {
                    const entry = auditLogs.entries.first();
                    if (entry && entry.target?.id === this.client.user?.id && entry.executor) {
                        inviterName = entry.executor.username || 'Unknown';
                    }
                }
            } catch {
                // Fallback if missing permissions
            }

            const iconUrl = guild.iconURL({ extension: 'png', size: 512 });

            const embed = {
                title: 'Joined a New Server',
                color: 0x57F287,
                description: `> **Server Name:** ${guild.name}\n> **Server ID:** ${guild.id}\n> **Member Count:** ${guild.memberCount}\n> **Owner:** ${ownerName}\n> **Added By:** ${inviterName}`,
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                footer: { text: `Total Servers: ${this.client.guilds.cache.size}` }
            };

            try {
                const ownerUser = await this.client.users.fetch(config.ownerId);
                await ownerUser.send({ embeds: [embed] });
            } catch (e) {
                Logger.warn('EventHandler', `Failed to send new guild alert to owner: ${e}`);
            }
            Logger.info('Guild', `Joined new guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
        });

        // Auto-destroy player when VC empties
        this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
            // Only care about leaves/moves from our channel
            const guildId = oldState.guild.id;
            const session = this.client.music.getSession(guildId);
            if (!session?.voiceChannel) return;

            const botVcId = session.voiceChannel.id;

            // Handle the bot's own voice state changes
            if (oldState.id === this.client.user?.id) {
                // Forcefully disconnected
                if (newState.channelId === null) {
                    Logger.info('VoiceState', `Bot was forcefully disconnected from VC in guild ${guildId}, destroying session.`);
                    void session.destroy();
                    return;
                }
                // Moved to a new channel
                else if (oldState.channelId !== newState.channelId) {
                    Logger.info('VoiceState', `Bot was moved to a new VC in guild ${guildId}, updating session.`);
                    const newVc = newState.guild.channels.cache.get(newState.channelId) as VoiceBasedChannel | undefined;
                    if (newVc) {
                        session.voiceChannel = newVc;

                        const humans = newVc.members.filter((m: GuildMember) => !m.user.bot);
                        if (humans.size === 0) {
                            if (session.isPlaying && !session.player?.paused) {
                                void session.pause();
                            }
                            const existing = this.emptyVcTimers.get(guildId);
                            if (!existing) {
                                const timerId = setTimeout(() => {
                                    if (!session.is247) {
                                        Logger.info('VoiceState', `VC empty for 3m in guild ${guildId}, destroying session`);
                                        void session.destroy();
                                    } else {
                                        Logger.info('VoiceState', `VC empty in guild ${guildId}, but 24/7 mode is enabled. Stopping player and clearing queue.`);
                                        void session.stop();
                                    }
                                    this.emptyVcTimers.delete(guildId);
                                }, 180000);
                                this.emptyVcTimers.set(guildId, timerId);
                            }
                        } else {
                            const existing = this.emptyVcTimers.get(guildId);
                            if (existing) {
                                clearTimeout(existing);
                                this.emptyVcTimers.delete(guildId);
                            }
                            if (session.player?.paused) {
                                void session.resume();
                            }
                        }
                    }
                    return;
                }
            }

            // Someone left or moved away from bot's VC
            if (oldState.channelId === botVcId && newState.channelId !== botVcId) {
                const vc = oldState.guild.channels.cache.get(botVcId) as VoiceBasedChannel | undefined;
                if (!vc) return;

                const humans = vc.members.filter((m: GuildMember) => !m.user.bot);
                if (humans.size === 0) {
                    const currentSession = this.client.music.getSession(guildId);
                    if (currentSession && currentSession.isPlaying && !currentSession.player?.paused) {
                        void currentSession.pause();
                    }
                    // Start 3m empty-VC timer
                    const timerId = setTimeout(() => {
                        const currentSession = this.client.music.getSession(guildId);
                        if (currentSession && !currentSession.is247) {
                            Logger.info('VoiceState', `VC empty for 3m in guild ${guildId}, destroying session`);
                            void currentSession.destroy();
                        } else if (currentSession?.is247) {
                            Logger.info('VoiceState', `VC empty in guild ${guildId}, but 24/7 mode is enabled. Stopping player and clearing queue.`);
                            void currentSession.stop();
                        }
                        this.emptyVcTimers.delete(guildId);
                    }, 180000);
                    this.emptyVcTimers.set(guildId, timerId);
                }
            }

            // Someone joined the bot's VC — cancel timer
            if (newState.channelId === botVcId && oldState.channelId !== botVcId) {
                const existing = this.emptyVcTimers.get(guildId);
                if (existing) {
                    clearTimeout(existing);
                    this.emptyVcTimers.delete(guildId);
                }
                const currentSession = this.client.music.getSession(guildId);
                if (currentSession && currentSession.player?.paused) {
                    void currentSession.resume();
                }
            }
        });
    }

    private registerShoukakuEvents(): void {
        this.client.shoukaku.on('ready', (name, lavalinkResume) => {
            Logger.info('Shoukaku', `Node ${name} connected (resumed: ${lavalinkResume})`);
        });

        this.client.shoukaku.on('error', (name, error) => {
            Logger.error('Shoukaku', `Node ${name} error`, error);
        });

        this.client.shoukaku.on('close', (name, code, reason) => {
            Logger.warn('Shoukaku', `Node ${name} closed [${code}]: ${reason}`);
        });

        this.client.shoukaku.on('disconnect', (name, count) => {
            Logger.warn('Shoukaku', `Node ${name} disconnected (players: ${count})`);
        });

        this.client.shoukaku.on('reconnecting', (name, reconnectsLeft, interval) => {
            Logger.info('Shoukaku', `Node ${name} reconnecting in ${interval}ms (${reconnectsLeft} tries left)`);
        });
    }

    private async handleInteraction(interaction: Interaction): Promise<void> {
        if (interaction.isAutocomplete()) {
            const command = this.client.commands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;

            try {
                await command.autocomplete(interaction as any, this.client);
            } catch (error) {
                Logger.warn('EventHandler', `Autocomplete error in ${interaction.commandName}: ${error}`);
                if (!interaction.responded) {
                    await interaction.respond([]).catch(() => { });
                }
            }
            return;
        }

        // Ignore non-slash-command interactions (buttons handled by collectors)
        if (!interaction.isChatInputCommand()) return;

        const command = this.client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            const start = process.hrtime.bigint();

            // Rate limit check (per guild)
            const rateLimitOk = this.rateLimiter.check(interaction);
            if (!rateLimitOk) return;

            // Global user rate limiter (Heavy abuse protection)
            GlobalRateLimiter.check(interaction.user.id);

            const requiredRole = command.permissionLevel === 1 ? 'dj' : command.permissionLevel === 2 ? 'admin' : command.permissionLevel === 3 ? 'owner' : undefined;
            const guardResult = await this.client.permissions.guard({
                member: interaction.member as GuildMember | null,
                guild: interaction.guild,
                user: interaction.user,
                commandName: interaction.commandName,
                source: 'slash',
                interaction,
                context: {
                    requiredRole,
                }
            });

            if (!guardResult.allowed) {
                const reason = guardResult.reason || 'Insufficient permissions.';
                await interaction.reply({
                    content: `**🔒 Access Denied**\n${reason}`,
                    ephemeral: true,
                });
                return;
            }

            const cooldownOk = this.cooldownMiddleware.check(interaction, command.cooldown ?? 3);
            if (!cooldownOk) return;

            if (command.middleware && command.middleware.length > 0) {
                const mwStart = process.hrtime.bigint();

                // Run all middleware concurrently. If any return false, fail out.
                const results = await Promise.all(
                    command.middleware.map(mw => mw(interaction, this.client))
                );

                const mwEnd = process.hrtime.bigint();
                const mwDuration = Number(mwEnd - mwStart) / 1e6;

                if (mwDuration > 100) {
                    Logger.warn('Performance', `Middleware suite took ${mwDuration.toFixed(2)}ms for ${interaction.commandName}`);
                }

                if (results.includes(false)) return;
            }

            const middlewareEnd = process.hrtime.bigint();
            const middlewareDuration = Number(middlewareEnd - start) / 1e6;
            if (middlewareDuration > 100) {
                Logger.warn('Performance', `Total Middleware took ${middlewareDuration.toFixed(2)}ms for ${interaction.commandName}`);
            }

            await command.execute(interaction, this.client);

            const end = process.hrtime.bigint();
            const totalDuration = Number(end - start) / 1e6;
            Logger.debug('Performance', `Command ${interaction.commandName} executed in ${totalDuration.toFixed(2)}ms`);
        } catch (error) {
            await ErrorHandler.handleInteractionError(interaction, error);
        }
    }

    destroy(): void {
        this.rateLimiter.destroy();
        this.cooldownMiddleware.destroy();
        for (const timer of this.emptyVcTimers.values()) {
            clearTimeout(timer);
        }
        this.emptyVcTimers.clear();
    }
}
