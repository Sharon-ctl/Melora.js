import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { Validators } from '../../utils/Validators.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { QueueController } from '../../controllers/QueueController.js';
const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription("Banish a sound from the path.")
        .addIntegerOption((opt) => opt.setName('position').setDescription("The targeted point in the path.").setRequired(true).setMinValue(1).setAutocomplete(true))
        .addIntegerOption((opt) => opt.setName('count').setDescription('Number of tracks to remove').setMinValue(1)),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying, SafetyChecks.requireRestricted],

    async autocomplete(interaction, client) {
        const session = client.music.getSession(interaction.guildId!);
        if (!session || session.queue.isEmpty) {
            await interaction.respond([]);
            return;
        }

        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'position') return;

        // Show first 25 tracks or filter by title if user typed a number (not really applicable for int option, but typically users see list)
        // Actually, for Integer options, focused.value is strictly integer-like or empty? 
        // Discord allows autocomplete for integers. The value sent is what they typed, but we return integers.
        // Let's just return the top 25 tracks in queue as defaults.

        const text = String(focused.value).toLowerCase();
        let tracks = session.queue.getAll().map((t, i) => ({ index: i + 1, title: t.title }));

        if (text) {
            tracks = tracks.filter(t => t.title.toLowerCase().includes(text) || String(t.index).includes(text));
        }

        await interaction.respond(
            tracks.slice(0, 25).map(t => ({
                name: `${t.index}. ${Validators.truncate(t.title, 50)}`,
                value: t.index
            }))
        );
    },

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const pos = interaction.options.getInteger('position', true);
        const count = interaction.options.getInteger('count') || 1;
        const context = new CommandContext(client, interaction);
        await QueueController.remove(context, pos, count);
    },
};

export default command;
