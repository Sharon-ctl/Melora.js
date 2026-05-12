import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription("Shift a sound to a new position.")
        .addIntegerOption(option =>
            option.setName('from')
                .setDescription("The origin position.")
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('to')
                .setDescription("The destination position.")
                .setRequired(true)
                .setMinValue(1)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requireRestricted],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const from = interaction.options.getInteger('from', true);
        const to = interaction.options.getInteger('to', true);
        const context = new CommandContext(client, interaction);
        await QueueController.move(context, from, to);
    },
};

export default command;
