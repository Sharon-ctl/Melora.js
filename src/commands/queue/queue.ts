import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';

import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder().setName('queue').setDescription("Observe the path of incoming sound."),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,
    middleware: [],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const context = new CommandContext(client, interaction);
        await QueueController.queue(context);
    },
};

export default command;
