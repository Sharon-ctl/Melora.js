import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('dedupe')
        .setDescription("Cleanse the path of repeating sounds."),
    permissionLevel: PermissionLevel.USER,
    cooldown: 5,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying, SafetyChecks.requireRestricted],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const session = client.music.getSession(interaction.guildId!)!;

        const removedCount = session.queue.deduplicate();

        if (removedCount === 0) {
            await interaction.reply({ content: 'The queue has no duplicates.', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: `Removed **${removedCount}** duplicate tracks.` });
        }
    },
};

export default command;
