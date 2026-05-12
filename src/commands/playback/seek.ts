import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { PlaybackController } from '../../controllers/PlaybackController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription("Shift the flow to a designated moment.")
        .addStringOption((opt) => opt.setName('position').setDescription("The targeted point in the path.").setRequired(true)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const posStr = interaction.options.getString('position', true);
        const context = new CommandContext(client, interaction);
        await PlaybackController.seek(context, posStr);
    },
};

export default command;
