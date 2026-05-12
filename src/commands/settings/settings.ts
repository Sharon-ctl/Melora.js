import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription("Observe and alter the boundaries of this space.")
        .addSubcommand((sub) =>
            sub.setName('djrole').setDescription("Designate the guides of the stream.")
                .addRoleOption((opt) => opt.setName('role').setDescription("The designated tier of control.")),
        )
        .addSubcommand((sub) =>
            sub.setName('restrict').setDescription("Confine the presence to a single focal point.")
                .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable restriction mode').setRequired(true)),
        )
        .addSubcommand((sub) =>
            sub.setName('volume-limit').setDescription('Set a volume limit.')
                .addIntegerOption((opt) => opt.setName('limit').setDescription("The absolute threshold.").setRequired(true).setMinValue(1).setMaxValue(150)),
        )
        .addSubcommand((sub) =>
            sub.setName('max-duration').setDescription('Set maximum track duration.')
                .addIntegerOption((opt) => opt.setName('minutes').setDescription('Maximum track duration').setRequired(true).setMinValue(1).setMaxValue(1440)),
        )
        .addSubcommand((sub) =>
            sub.setName('max-queue').setDescription('Set maximum queue size.')
                .addIntegerOption((opt) => opt.setName('size').setDescription('Maximum queue capacity').setRequired(true).setMinValue(1).setMaxValue(5000)),
        )
        .addSubcommand((sub) =>
            sub.setName('view').setDescription("Observe the boundaries of this space."),
        ),
    permissionLevel: PermissionLevel.GUILD_ADMIN,
    cooldown: 5,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const guildId = interaction.guildId!;
        const sub = interaction.options.getSubcommand(true);

        if (sub === 'djrole') {
            const role = interaction.options.getRole('role');
            await client.settings.setDjRole(guildId, role?.id ?? null);
            const desc = role ? `DJ role set to <@&${role.id}>.` : 'DJ role cleared.';
            await interaction.reply({ content: `${desc}` });

        } else if (sub === 'restrict') {
            const enabled = interaction.options.getBoolean('enabled', true);
            await client.settings.setRestricted(guildId, enabled);
            await interaction.reply({ content: `Restricted mode **${enabled ? 'enabled' : 'disabled'}**.` });

        } else if (sub === 'volume-limit') {
            const limit = interaction.options.getInteger('limit', true);
            await client.settings.setVolumeLimit(guildId, limit);
            await interaction.reply({ content: `Volume limit set to **${limit}%**.` });

        } else if (sub === 'max-duration') {
            const minutes = interaction.options.getInteger('minutes', true);
            await client.settings.setMaxDuration(guildId, minutes * 60000);
            await interaction.reply({ content: `Max duration set to **${minutes} minutes**.` });

        } else if (sub === 'max-queue') {
            const size = interaction.options.getInteger('size', true);
            await client.settings.setMaxQueueSize(guildId, size);
            await interaction.reply({ content: `Max queue set to **${size}**.` });

        } else {
            const s = await client.settings.getSettings(guildId);

            const info = `**Server Settings**\n\n` +
                `**DJ Role**: ${s.djRoleId ? `<@&${s.djRoleId}>` : 'None'}\n` +
                `**Restricted Mode**: ${s.restricted ? 'Enabled' : 'Disabled'}\n` +
                `**Volume Limit**: ${s.volumeLimit}%\n` +
                `**Max Duration**: ${s.maxDuration === 0 ? 'Unlimited' : Math.floor(s.maxDuration / 60000) + ' min'}\n` +
                `**Max Queue Size**: ${s.maxQueueSize}`;

            await interaction.reply({ content: info });
        }
    },
};

export default command;
