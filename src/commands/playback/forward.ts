import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { PlaybackController } from '../../controllers/PlaybackController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('forward')
        .setDescription("Push the stream forward in time.")
        .addIntegerOption((opt) => opt.setName('seconds').setDescription('Seconds to forward').setRequired(true).setMinValue(1)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const seconds = interaction.options.getInteger('seconds', true);
        const context = new CommandContext(client, interaction);
        await PlaybackController.forward(context, seconds);
    },
};

export default command;
