import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ButtonInteraction,
    ComponentType,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    type Message,
} from 'discord.js';
import type { TrackInfo } from '../types/index.js';
import { Validators } from '../utils/Validators.js';
import type { CommandContext } from '../controllers/CommandContext.js';

const TRACKS_PER_PAGE = 10;

export class QueuePanel {
    static async send(
        context: CommandContext,
        tracks: TrackInfo[],
        currentTrack: TrackInfo | null,
        title = '**Queue**'
    ): Promise<void> {

        if (tracks.length === 0 && !currentTrack) {
            await context.reply('Queue is empty.', true);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE));
        let page = 0;

        const buildPage = (p: number): ContainerBuilder => {
            const start = p * TRACKS_PER_PAGE;
            const pageTracks = tracks.slice(start, start + TRACKS_PER_PAGE);

            const container = new ContainerBuilder().setAccentColor(0xFFC1CC);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(title),
            );

            if (currentTrack) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**Now Playing:** [${Validators.truncate(currentTrack.title, 50)}](${currentTrack.uri}) — ${currentTrack.author}`,
                    ),
                );
            }

            if (pageTracks.length > 0) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                const lines = pageTracks.map((t, i) =>
                    `\`${start + i + 1}.\` [${Validators.truncate(t.title, 40)}](${t.uri}) — \`${Validators.formatDuration(t.duration)}\``,
                );
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**Up Next**\n${lines.join('\n')}`),
                );
            } else {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('*No more tracks in queue.*'),
                );
            }

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

            const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# Page ${p + 1}/${totalPages}  •  ${tracks.length} tracks  •  Total: ${Validators.formatDuration(totalDuration)}`,
                ),
            );

            return container;
        };

        const buildButtons = (p: number): ActionRowBuilder<ButtonBuilder> => {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('queue_first')
                    .setLabel('<<')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(p === 0),
                new ButtonBuilder()
                    .setCustomId('queue_prev')
                    .setLabel('<')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(p === 0),
                new ButtonBuilder()
                    .setCustomId('queue_next')
                    .setLabel('>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(p >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId('queue_last')
                    .setLabel('>>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(p >= totalPages - 1),
            );
        };

        const buildPageWithButtons = (p: number, includeButtons: boolean, disabled = false): ContainerBuilder => {
            const container = buildPage(p);
            if (includeButtons) {
                if (disabled) {
                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        ...buildButtons(p).components.map((b) =>
                            ButtonBuilder.from(b.toJSON()).setDisabled(true)
                        ),
                    );
                    container.addActionRowComponents(row);
                } else {
                    container.addActionRowComponents(buildButtons(p));
                }
            }
            return container;
        };

        const msg = await context.reply({
            components: [buildPageWithButtons(page, totalPages > 1)],
        }) as Message;

        if (!msg) return; // if reply failed

        if (totalPages <= 1) return;

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000,
        });

        let lastInteractionTime = 0;

        collector.on('collect', async (btn: ButtonInteraction) => {
            if (btn.user.id !== context.user.id) {
                await btn.reply({ content: 'Only the command user can navigate.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }

            const now = Date.now();
            if (now - lastInteractionTime < 500) {
                await btn.deferUpdate().catch(() => {});
                return;
            }
            lastInteractionTime = now;

            switch (btn.customId) {
                case 'queue_first': page = 0; break;
                case 'queue_prev': page = Math.max(0, page - 1); break;
                case 'queue_next': page = Math.min(totalPages - 1, page + 1); break;
                case 'queue_last': page = totalPages - 1; break;
            }

            try {
                await btn.update({
                    components: [buildPageWithButtons(page, true)],
                    flags: MessageFlags.IsComponentsV2,
                });
            } catch {
                if (!btn.replied && !btn.deferred) {
                     await btn.deferUpdate().catch(() => {});
                }
            }
        });

        collector.on('end', async () => {
            await msg.edit({
                components: [buildPageWithButtons(page, false)],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => { });
        });
    }
}
