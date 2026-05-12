import { type ChatInputCommandInteraction } from 'discord.js';
import type { MeloraClient } from '../../../core/Client.js';
import { CommandContext } from '../../../controllers/CommandContext.js';
import { PlaylistController } from '../../../controllers/PlaylistController.js';

export async function list(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
    const context = new CommandContext(client, interaction);
    await PlaylistController.list(context);
}
