import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { AdminController } from '../../controllers/AdminController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('247')
        .setDescription('Toggle 24/7 mode (prevent bot from leaving voice channel)'),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 5,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const context = new CommandContext(client, interaction);
        await AdminController.toggle247(context);
    },
};

export default command;
