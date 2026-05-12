import {
    SlashCommandBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';

import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('defaultvolume')
        .setDescription("Set the initial intensity of the stream.")
        .addIntegerOption((opt) =>
            opt.setName('volume').setDescription("Calibrate the intensity of the stream.").setRequired(true).setMinValue(1).setMaxValue(200),
        ),
    permissionLevel: PermissionLevel.GUILD_ADMIN,
    cooldown: 5,
    middleware: [],

    async execute(interaction, client: MeloraClient): Promise<void> {
        const volume = interaction.options.getInteger('volume', true);

        await client.settings.setDefaultVolume(interaction.guildId!, volume);

        await interaction.reply(`Default volume set to **${volume}%** for future sessions.`);
    },
};

export default command;
