import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { PlaybackController } from '../../controllers/PlaybackController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder().setName('nowplaying').setDescription("Observe the sound currently flowing."),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const context = new CommandContext(client, interaction);
        await PlaybackController.nowplaying(context);
    },
};

export default command;
