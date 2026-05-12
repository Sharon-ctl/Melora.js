import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription("Purge all upcoming sound from the path.")
        .addUserOption((opt) => opt.setName('user').setDescription("The individual to reflect upon.")),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 5,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requireRestricted],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const user = interaction.options.getUser('user');
        const context = new CommandContext(client, interaction);
        await QueueController.clear(context, user?.id);
    },
};

export default command;
