import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { MeloraClient } from '../../../core/Client.js';
import { CommandContext } from '../../../controllers/CommandContext.js';
import { PlaylistController } from '../../../controllers/PlaylistController.js';

export async function share(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
    const name = interaction.options.getString('name', true);
    const targetUser = interaction.options.getUser('user', true);

    if (targetUser.bot) {
        await interaction.reply({ content: 'Cannot share playlists with bots.', flags: MessageFlags.Ephemeral });
        return;
    }

    const context = new CommandContext(client, interaction);
    await PlaylistController.share(context, name, targetUser.id, targetUser.username);
}
