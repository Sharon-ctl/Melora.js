import type { CommandContext } from './CommandContext.js';

export class UtilityController {



    static async help(context: CommandContext): Promise<void> {
        const {
            ActionRowBuilder,
            StringSelectMenuBuilder,
            StringSelectMenuOptionBuilder,
            ComponentType,
            ContainerBuilder,
            TextDisplayBuilder,
            SeparatorBuilder,
            MessageFlags,
            ButtonBuilder,
            ButtonStyle
        } = await import('discord.js');
        const { PermissionLevel } = await import('../types/index.js');

        const CATEGORY_MAP: Record<string, string> = {
            home: 'Home',
            playback: 'Playback',
            queue: 'Queue',
            filters: 'Filters',
            playlists: 'Playlists',
            fun: 'Fun',
            settings: 'Settings',
            stats: 'Statistics',
            utility: 'Utility',
            info: 'Information',
            admin: 'Admin',
        };

        const categories = new Map<string, any[]>();

        for (const cmd of context.client.commands.values()) {
            if (cmd.permissionLevel === PermissionLevel.BOT_OWNER) continue;

            const cat = cmd.category || 'utility';
            if (!categories.has(cat)) {
                categories.set(cat, []);
            }
            categories.get(cat)!.push(cmd);
        }

        const buildContainer = (categoryKey: string, menuRow?: any, buttonRow?: any) => {
            const container = new ContainerBuilder().setAccentColor(0xFFC1CC);

            if (categoryKey === 'home') {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Melora`));
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

                let desc = `Melora here. A lightning-fast, minimalist music player built by 7Flow.\n\n`;
                desc += `**Features:**\n`;
                desc += `- High-performance audio playback\n`;
                desc += `- Personal saved playlists & favorites\n`;
                desc += `- Seamless 24/7 playback mode\n`;
                desc += `- DJ and Admin controls\n\n`;
                desc += `**Useful Commands:**\n`;
                desc += `- \`/play <query>\` - Play a track or playlist\n`;
                desc += `- \`/queue\` - View and manage the current queue\n`;
                desc += `- \`/favorites list\` - View your saved tracks\n\n`;
                desc += `*Select a category from the dropdown menu below to view all available commands.*`;

                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
                if (menuRow) container.addActionRowComponents(menuRow as any);
                if (buttonRow) container.addActionRowComponents(buttonRow as any);
                return container;
            }

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${CATEGORY_MAP[categoryKey] ?? 'Commands'}`));
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

            const cmds = categories.get(categoryKey) || [];
            let description = '';

            for (const c of cmds.sort((a, b) => a.data.name.localeCompare(b.data.name))) {
                let usage = `/${c.data.name}`;
                const options = (c.data as any).options;
                if (options && Array.isArray(options)) {
                    for (const opt of options) {
                        const optName = opt.name;
                        const isRequired = opt.required;
                        usage += isRequired ? ` <${optName}>` : ` [${optName}]`;
                    }
                }

                // Ensure no emojis in description
                let cleanDesc = c.data.description.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
                description += `**\`${usage}\`** — ${cleanDesc}\n`;
            }

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description.trim() || 'No commands found.'));
            if (menuRow) container.addActionRowComponents(menuRow as any);
            if (buttonRow) container.addActionRowComponents(buttonRow as any);
            return container;
        };

        const existingKeys = Array.from(categories.keys()).sort();
        const keys = ['home', ...existingKeys];
        let currentCategory = 'home';

        const buildMenu = (selected: string) => {
            const menu = new StringSelectMenuBuilder()
                .setCustomId('help_category')
                .setPlaceholder('Select a category...');

            for (const k of keys) {
                if (menu.options.length >= 25) break;

                menu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(CATEGORY_MAP[k] ?? k)
                        .setValue(k)
                        .setDefault(k === selected)
                );
            }
            return new ActionRowBuilder().addComponents(menu) as any;
        };

        const buildButtons = () => {
            const voteButton = new ButtonBuilder()
                .setLabel('Vote')
                .setStyle(ButtonStyle.Link)
                .setURL('https://top.gg/bot/1372777810812473426');

            const inviteButton = new ButtonBuilder()
                .setLabel('Invite Bot')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com/oauth2/authorize?client_id=1372777810812473426');

            const supportButton = new ButtonBuilder()
                .setLabel('Support Server')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.gg/GBEk4vkNYY');

            return new ActionRowBuilder().addComponents(voteButton, inviteButton, supportButton) as any;
        };

        const payload: any = {
            components: [buildContainer(currentCategory, buildMenu(currentCategory), buildButtons()) as any],
        };

        const msg = await context.reply(payload);

        if (!msg || !('createMessageComponentCollector' in msg)) return;

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 120000,
        });

        collector.on('collect', async (i) => {
            try {
                if (i.user.id !== context.user.id) {
                    await i.reply({ content: 'Only the command author can use this.', ephemeral: true });
                    return;
                }

                const selected = i.values[0];
                if (selected) {
                    currentCategory = selected;
                }

                await i.update({
                    components: [buildContainer(currentCategory, buildMenu(currentCategory), buildButtons()) as any],
                    flags: MessageFlags.IsComponentsV2,
                    embeds: []
                });
            } catch (error) {
                // Safe swallow
            }
        });

        collector.on('end', async () => {
            try {
                await msg.edit({
                    components: [buildContainer(currentCategory, undefined, buildButtons()) as any],
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (error) {
                // Ignore message deleted errors
            }
        });
    }
}
