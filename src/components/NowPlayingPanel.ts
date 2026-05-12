import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type TextBasedChannel,
    type Message,
    EmbedBuilder,
    InteractionCollector,
    MessageFlags,
    type MessageEditOptions,
    type MessageCreateOptions,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import { LoopMode, type TrackInfo } from '../types/index.js';
import type { GuildSession } from '../structures/GuildSession.js';
import { Validators } from '../utils/Validators.js';
import { Logger } from '../utils/Logger.js';
import { QueuePanel } from './QueuePanel.js';

export class NowPlayingPanel {
    private track: TrackInfo;
    private readonly session: GuildSession;
    private message: Message | null = null;
    private destroyed = false;
    private messagesSinceLastUpdate = 0;

    constructor(track: TrackInfo, session: GuildSession) {
        this.track = track;
        this.session = session;
    }

    setTrack(track: TrackInfo): void {
        this.track = track;
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    private async buildMessagePayload(disabled = false): Promise<MessageEditOptions & MessageCreateOptions> {
        const loopMode = this.session.queue.loopMode;
        const queueSize = this.session.queue.size;
        const player = this.session.player;
        const paused = player?.paused ?? false;
        const volume = player?.volume ?? 100;

        // Truncate title to 45 characters (slightly longer)
        const title = Validators.truncate(this.track.title, 45);

        // Footer Status Logic
        let loopStatus = 'Off';
        if (loopMode === LoopMode.TRACK) loopStatus = 'Track';
        else if (loopMode === LoopMode.QUEUE) loopStatus = 'Queue';
        else if (loopMode === LoopMode.AUTOPLAY) loopStatus = 'Autoplay';

        // Optimistic Avatar Fetching
        let requesterAvatar: string | undefined = undefined;
        const cachedUser = this.session.client.users.cache.get(this.track.requester.id);
        if (cachedUser) {
            requesterAvatar = cachedUser.displayAvatarURL({ forceStatic: false });
        } else {
            this.session.client.users.fetch(this.track.requester.id).catch(() => { });
        }

        const clientUser = this.session.client.user;
        const botName = clientUser ? clientUser.username : 'Bot';
        const botAvatar = clientUser ? clientUser.displayAvatarURL() : undefined;

        const embed = new EmbedBuilder()
            .setColor(0xFFC1CC) // Existing nowPlaying color
            .setAuthor({
                name: `${botName} | ${paused ? 'Paused' : 'Playing'}`,
                iconURL: botAvatar
            })
            .setDescription(
                `### <:musicalnote:1474944534357082142> [${title}](${this.track.uri})\n` +
                `<:user:1490232864023773316> **Played by <@${this.track.requester.id}>** | <:duration:1489895598231523450> **Duration:** **${Validators.formatDuration(this.track.duration)}**`
            )
            .setFooter({
                text: `Vol: ${volume}% • Loop: ${loopStatus} • Queue: ${queueSize} • 24/7: ${this.session.is247 ? 'On' : 'Off'}`,
                iconURL: requesterAvatar
            });

        if (this.track.artworkUrl) {
            embed.setThumbnail(this.track.artworkUrl);
        }

        if (this.track.dedicateTo) {
            const userId = this.track.dedicateTo.id;
            const parts = [`<@${userId}>`];
            if (this.track.dedicateNote) {
                parts.push(`**${this.track.dedicateNote}**`);
            }
            embed.addFields({ name: '💝 Dedicated to', value: parts.join('\n') });
        }

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('np_loop')
                .setEmoji('<:loop2:1473600843759489065>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_previous')
                .setEmoji('<:previous2:1473600850151604429>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || this.session.queue.getHistory().length === 0),
            new ButtonBuilder()
                .setCustomId('np_pause')
                .setEmoji(paused ? '<:play2:1473600848176087155>' : '<:pause2:1473600845898711253>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_skip')
                .setEmoji('<:skip2:1473600852274184243>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_shuffle')
                .setEmoji('<:shuffle2:1473631756564562023>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
        );

        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('np_queue')
                .setEmoji('<:queue2:1473631751434801203>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_voldown')
                .setEmoji('<:volumedown2:1473631758695006251>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_stop')
                .setEmoji('<:stop2:1473600854782378035>')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_volup')
                .setEmoji('<:volumeup2:1473631761803247742>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('np_favorite')
                .setEmoji('💕')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
        );

        const components: any[] = [row1, row2];

        if (queueSize > 0) {
            const upNext = this.session.queue.getAll().slice(0, 25);
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('np_jump')
                .setPlaceholder('Select a song from the queue to jump to...')
                .setDisabled(disabled);

            upNext.forEach((t, i) => {
                const label = Validators.truncate(`${i + 1}. ${t.title}`, 100);
                const desc = Validators.truncate(`By ${t.author}`, 100);
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setDescription(desc)
                        .setValue(i.toString())
                        .setEmoji('1474944534357082142')
                );
            });
            components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
        }

        return {
            embeds: [embed],
            components,
            allowedMentions: { parse: [] }
        };
    }

    private messagePromise: Promise<Message> | null = null;

    async update(): Promise<void> {
        if (this.destroyed) return;

        // If a message is actively being created right now, wait for it
        if (this.messagePromise) {
            try {
                await this.messagePromise;
            } catch {
                // Ignore, let it try to send again if it failed
            }
        }

        if (this.message && this.message.editable) {
            try {
                await this.message.edit(await this.buildMessagePayload());
                return;
            } catch (error) {
                Logger.warn('NowPlayingPanel', `Failed to edit message: ${error}, sending new one.`);
                this.message = null;
            }
        }

        if (this.session.textChannel && 'send' in this.session.textChannel) {
            try {
                if (this.message) {
                    await this.message.delete().catch(() => { });
                }

                // Lock message creation to prevent concurrent duplicates
                this.messagePromise = this.session.textChannel.send(await this.buildMessagePayload());
                this.message = await this.messagePromise;
                this.messagePromise = null;
                
                this.startCollector();
            } catch (error) {
                this.messagePromise = null;
                Logger.error('NowPlayingPanel', `Failed to send message: ${error}`);
            }
        }
    }

    async send(channel: TextBasedChannel): Promise<void> {
        if (!this.session.textChannel && channel) {
            this.session.textChannel = channel;
        }
        await this.update();
    }

    private collector: InteractionCollector<any> | null = null;
    private lastInteractionTime = 0;

    private startCollector(): void {
        if (!this.message) return;

        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.message.createMessageComponentCollector({
            time: 24 * 60 * 60 * 1000,
        });

        this.collector.on('collect', async (btnInteraction) => {
            if (this.destroyed) {
                await btnInteraction.deferUpdate().catch(() => { });
                return;
            }

            const now = Date.now();
            if (now - this.lastInteractionTime < 500) {
                await btnInteraction.deferUpdate().catch(() => { });
                return;
            }
            this.lastInteractionTime = now;

            try {
                const userVc = (btnInteraction.member as any)?.voice?.channelId;
                const botVc = this.session.voiceChannel?.id;

                if (botVc && userVc !== botVc) {
                    await btnInteraction.reply({
                        content: 'You must be in the same voice channel as the bot to use these controls.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                switch (btnInteraction.customId) {
                    case 'np_pause':
                        if (this.session.player?.paused) {
                            await this.session.resume();
                        } else {
                            await this.session.pause();
                        }
                        await btnInteraction.update(await this.buildMessagePayload());
                        break;

                    case 'np_skip':
                        await btnInteraction.deferUpdate();
                        await this.session.skipCurrent();
                        break;

                    case 'np_stop': {
                        const stopUsername = btnInteraction.user.displayName || btnInteraction.user.username;
                        await btnInteraction.deferUpdate();
                        if (btnInteraction.channel && 'send' in btnInteraction.channel) {
                            await btnInteraction.channel.send({ content: `\`${stopUsername}\` stopped the music!` }).catch(() => { });
                        }
                        await this.session.stop();
                        break;
                    }

                    case 'np_previous':
                        await btnInteraction.deferUpdate();
                        await this.session.playPrevious();
                        break;

                    case 'np_loop': {
                        const modes = [LoopMode.OFF, LoopMode.TRACK, LoopMode.QUEUE, LoopMode.AUTOPLAY];
                        const currentIdx = modes.indexOf(this.session.queue.loopMode);
                        const nextMode = modes[(currentIdx + 1) % modes.length]!;
                        this.session.queue.loopMode = nextMode;
                        await btnInteraction.update(await this.buildMessagePayload());
                        break;
                    }

                    case 'np_shuffle':
                        this.session.queue.smartShuffle();
                        await btnInteraction.reply({ content: `**${btnInteraction.user.displayName || btnInteraction.user.username}** shuffled the queue.` });
                        break;

                    case 'np_queue': {
                        const queueTracks = this.session.queue.getAll();
                        const current = this.session.queue.current;
                        await QueuePanel.send(btnInteraction, queueTracks, current);
                        break;
                    }

                    case 'np_voldown': {
                        const v1 = Math.max(0, (this.session.player?.volume ?? 100) - 10);
                        await this.session.player?.setVolume(v1);
                        await btnInteraction.update(await this.buildMessagePayload());
                        break;
                    }

                    case 'np_volup': {
                        // Respect guild volume limit
                        let maxVol = 150;
                        try {
                            const guildSettings = await this.session.client.settings.getSettings(this.session.guildId);
                            maxVol = guildSettings.volumeLimit;
                        } catch { /* fallback to 150 */ }
                        const v2 = Math.min(maxVol, (this.session.player?.volume ?? 100) + 10);
                        await this.session.player?.setVolume(v2);
                        await btnInteraction.update(await this.buildMessagePayload());
                        break;
                    }

                    case 'np_favorite': {
                        await btnInteraction.deferReply({ flags: MessageFlags.Ephemeral });
                        const res = await this.session.client.favorites.add(btnInteraction.user.id, this.track);
                        if (res.success) {
                            await btnInteraction.editReply(`❤️ Added **${this.track.title}** to your favorites.`);
                            if (this.track.requester.id !== btnInteraction.user.id) {
                                if (this.session.textChannel && 'send' in this.session.textChannel) {
                                    await this.session.textChannel.send({
                                        content: `💖 <@${this.track.requester.id}>, your track **${Validators.truncate(this.track.title, 30)}** was loved by <@${btnInteraction.user.id}>! Great taste!`
                                    }).catch(() => { });
                                }
                            }
                        } else {
                            await btnInteraction.editReply(res.reason || 'Failed to add favorite.');
                        }
                        break;
                    }

                    case 'np_jump': {
                        if (btnInteraction.isStringSelectMenu()) {
                            await btnInteraction.deferUpdate();
                            const index = parseInt(btnInteraction.values[0]!, 10);
                            if (!isNaN(index)) {
                                if (index > 0) {
                                    this.session.queue.removeRange(0, index - 1);
                                }
                                await this.session.skipCurrent();
                            }
                        }
                        break;
                    }
                }
            } catch (error) {
                Logger.warn('NowPlayingPanel', `Button interaction failed: ${error}`);
                if (!btnInteraction.replied && !btnInteraction.deferred) {
                    await btnInteraction.deferUpdate().catch(() => { });
                }
            }
        });

        this.collector.on('end', () => {
            if (this.destroyed) {
                this.disableButtons();
            }
        });
    }

    async checkResend(): Promise<void> {
        if (this.destroyed || !this.message) return;

        this.messagesSinceLastUpdate++;

        if (this.messagesSinceLastUpdate >= 5) {
            Logger.debug('NowPlayingPanel', `Resending panel for ${this.session.guildId}(buried by chat)`);
            this.messagesSinceLastUpdate = 0;

            if (this.collector) {
                this.collector.stop();
                this.collector = null;
            }

            try {
                await this.message.delete().catch(() => { });
            } catch { }
            this.message = null;

            if (this.session.textChannel) {
                await this.send(this.session.textChannel);
            }
        }
    }

    private disableButtons(): void {
        if (!this.message) return;
        void this.buildMessagePayload(true).then(payload => {
            this.message?.edit(payload).catch(() => { });
        }).catch(() => { });
    }

    async destroy(): Promise<void> {
        this.destroyed = true;
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }
        if (this.message) {
            await this.message.delete().catch(() => { });
            this.message = null;
        }
    }
}
