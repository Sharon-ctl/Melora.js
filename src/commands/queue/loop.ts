import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription("Bind the flow into a continuous cycle.")
        .addStringOption((opt) =>
            opt.setName('mode')
                .setDescription("The nature of the cycle.")
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Track', value: 'track' },
                    { name: 'Queue', value: 'queue' },
                    { name: 'Autoplay', value: 'autoplay' },
                ),
        ),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying, SafetyChecks.requireRestricted],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const modeInput = interaction.options.getString('mode', true);
        const context = new CommandContext(client, interaction);
        await QueueController.loop(context, modeInput);
    },
};

export default command;
