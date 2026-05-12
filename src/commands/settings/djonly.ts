import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { AdminController } from '../../controllers/AdminController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('djonly')
        .setDescription("Confine control to the designated guides.")
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Toggle DJ-only mode.').setRequired(true)),
    permissionLevel: PermissionLevel.GUILD_ADMIN,
    cooldown: 5,
    middleware: [],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const enabled = interaction.options.getBoolean('enabled', true);
        const context = new CommandContext(client, interaction);
        await AdminController.djOnly(context, enabled);
    },
};

export default command;
