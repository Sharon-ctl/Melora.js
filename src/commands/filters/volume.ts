import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { PlaybackController } from '../../controllers/PlaybackController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription("Calibrate the intensity of the stream.")
        .addIntegerOption((opt) => opt.setName('level').setDescription("The desired magnitude.").setRequired(true).setMinValue(0).setMaxValue(150)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        let level = interaction.options.getInteger('level', true);
        const context = new CommandContext(client, interaction);
        await PlaybackController.volume(context, level);
    },
};

export default command;
