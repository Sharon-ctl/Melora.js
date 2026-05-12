import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('fix')
        .setDescription('Reset the audio player.'),
    permissionLevel: PermissionLevel.USER,
    cooldown: 10,
    middleware: [],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const session = client.music.getSession(interaction.guildId!);

        // Force leave functionality
        try {
            if (session) {
                await session.destroy();
            }
            client.shoukaku.leaveVoiceChannel(interaction.guildId!);

            await interaction.reply('Player reset — session cleared.');
        } catch (e) {
            await interaction.reply(`Reset failed — ${e}`);
        }
    },
};

export default command;
