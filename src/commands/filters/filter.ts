import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import { SafetyChecks } from '../../middleware/SafetyChecks.js';
import type { MeloraClient } from '../../core/Client.js';
import { CommandContext } from '../../controllers/CommandContext.js';
import { FilterController } from '../../controllers/FilterController.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription("Shape the texture of the active sound.")
        .addSubcommand((sub) =>
            sub.setName('add')
                .setDescription("Weave a track into the collection.")
                .addStringOption((opt) =>
                    opt.setName('name').setDescription("The designation to apply.").setRequired(true)
                        .addChoices(
                            { name: 'Bassboost', value: 'bassboost' },
                            { name: 'Nightcore', value: 'nightcore' },
                            { name: 'Vaporwave', value: 'vaporwave' },
                            { name: '8D', value: '8d' },
                            { name: 'Karaoke', value: 'karaoke' },
                            { name: 'Tremolo', value: 'tremolo' },
                            { name: 'Vibrato', value: 'vibrato' },
                            { name: 'Distortion', value: 'distortion' },
                            { name: 'Low Pass', value: 'lowpass' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('remove')
                .setDescription("Banish a sound from the path.")
                .addStringOption((opt) =>
                    opt.setName('name').setDescription("The designation to apply.").setRequired(true)
                        .addChoices(
                            { name: 'Bassboost', value: 'bassboost' },
                            { name: 'Nightcore', value: 'nightcore' },
                            { name: 'Vaporwave', value: 'vaporwave' },
                            { name: '8D', value: '8d' },
                            { name: 'Karaoke', value: 'karaoke' },
                            { name: 'Tremolo', value: 'tremolo' },
                            { name: 'Vibrato', value: 'vibrato' },
                            { name: 'Distortion', value: 'distortion' },
                            { name: 'Low Pass', value: 'lowpass' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('reset').setDescription('Clear all filters'),
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription("Observe your forged collections."),
        ),
    permissionLevel: PermissionLevel.DJ_ROLE,
    cooldown: 5,
    middleware: [SafetyChecks.requireVoiceChannel, SafetyChecks.requireSameChannel, SafetyChecks.requirePlaying],

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const subcommand = interaction.options.getSubcommand(true);
        const context = new CommandContext(client, interaction);

        if (subcommand === 'add') {
            const name = interaction.options.getString('name', true);
            await FilterController.addFilter(context, name);
        } else if (subcommand === 'remove') {
            const name = interaction.options.getString('name', true);
            await FilterController.removeFilter(context, name);
        } else if (subcommand === 'reset') {
            await FilterController.resetFilters(context);
        } else {
            await FilterController.listFilters(context);
        }
    },
};

export default command;
