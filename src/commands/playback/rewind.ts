import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { PlaybackController } from '../../controllers/PlaybackController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('rewind')
        .setDescription("Pull the stream backward in time.")
        .addIntegerOption((opt) => opt.setName('seconds').setDescription('Seconds to rewind').setRequired(true).setMinValue(1)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const seconds = interaction.options.getInteger('seconds', true);
        const context = new CommandContext(client, interaction);
        await PlaybackController.rewind(context, seconds);
    },
};

export default command;
