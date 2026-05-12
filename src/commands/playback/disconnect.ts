
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { PlaybackController } from '../../controllers/PlaybackController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder().setName('disconnect').setDescription("Release the presence from the channel."),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 5,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const context = new CommandContext(client, interaction);
        await PlaybackController.leave(context);
    },
};

export default command;
