import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('queue-forecast')
        .setDescription('Estimate when an upcoming track will start.')
        .addIntegerOption(option => option
            .setName('position')
            .setDescription('Position shown in /queue.')
            .setRequired(true)
            .setMinValue(1)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const position = interaction.options.getInteger('position', true);
        await QueueController.forecast(new CommandContext(client, interaction), position);
    },
};

export default command;
