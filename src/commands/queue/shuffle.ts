import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription("Scatter the order of the incoming path."),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requireRestricted],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const context = new CommandContext(client, interaction);
        await QueueController.shuffle(context);
    },
};

export default command;

