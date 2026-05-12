import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../types/index.js';
import { PermissionLevel } from '../../types/index.js';
import type { MeloraClient } from '../../core/Client.js';

// Subcommand Imports
import { create } from './subcommands/create.js';
import { deletePlaylist } from './subcommands/delete.js';
import { list } from './subcommands/list.js';
import { view } from './subcommands/view.js';
import { play } from './subcommands/play.js';
import { add } from './subcommands/add.js';
import { remove } from './subcommands/remove.js';
import { renamePlaylist } from './subcommands/rename_cmd.js';
import { share } from './subcommands/share.js';
import { unshare } from './subcommands/unshare.js';

const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription("Manage your forged collections of sound.")
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription("Forge a new collection of sound.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription("Dissolve a collection permanently.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName('rename')
                .setDescription('Rename a playlist')
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
                .addStringOption(opt => opt.setName('newname').setDescription('New playlist name').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription("Observe your forged collections.")
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription("Examine the contents of a collection.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription("Pour the collection into the active path.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription("Weave a track into the collection.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
                .addStringOption(opt => opt.setName('url').setDescription('Track URL to add (optional)'))
        )
        .addSubcommand(sub =>
            sub.setName('share')
                .setDescription("Open the collection for others to grasp.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
                .addUserOption(opt => opt.setName('user').setDescription("The individual to reflect upon.").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('unshare')
                .setDescription("Close the collection from outer grasp.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
                .addUserOption(opt => opt.setName('user').setDescription("The individual to reflect upon.").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription("Extract a track from the collection.")
                .addStringOption(opt => opt.setName('name').setDescription("The designation to apply.").setRequired(true).setAutocomplete(true))
                .addIntegerOption(opt => opt.setName('index').setDescription('List position of track').setRequired(true))
        ),
    permissionLevel: PermissionLevel.USER,
    cooldown: 3,

    async autocomplete(interaction, client) {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'name') {
            const playlists = await client.playlists.getUserPlaylists(interaction.user.id);
            const filtered = playlists.filter(p => p.name.toLowerCase().includes(focused.value.toLowerCase()));
            await interaction.respond(
                filtered.slice(0, 25).map(p => ({
                    name: `${p.name} (${p.tracks.length} tracks)`,
                    value: p.id
                }))
            );
        }
    },

    async execute(interaction: ChatInputCommandInteraction, client: MeloraClient): Promise<void> {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create': await create(interaction, client); break;
            case 'delete': await deletePlaylist(interaction, client); break;
            case 'rename': await renamePlaylist(interaction, client); break;
            case 'list': await list(interaction, client); break;
            case 'view': await view(interaction, client); break;
            case 'play': await play(interaction, client); break;
            case 'add': await add(interaction, client); break;
            case 'remove': await remove(interaction, client); break;
            case 'share': await share(interaction, client); break;
            case 'unshare': await unshare(interaction, client); break;
        }
    },
};

export default command;
