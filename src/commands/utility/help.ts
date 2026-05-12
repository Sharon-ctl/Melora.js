import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { UtilityController } from '../../controllers/UtilityController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription("Navigate the capabilities of this presence."),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,
    execute: async (interaction: ChatInputCommandInteraction, client: MeloraClient) => {
        const context = new CommandContext(client, interaction);
        await UtilityController.help(context);
    },
};

export default command;
