import {
    type ChatInputCommandInteraction,
    type GuildMember,
    PermissionFlagsBits,
} from 'discord.js';
import type { MeloraClient } from '../core/Client.js';
import { config } from '../config/config.js';

export class SafetyChecks {
    private static async sendError(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
        const payload = {
            content: `**Safety Check Failed**\n${message}`,
            ephemeral: true,
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    }

    static async requireVoiceChannel(
        interaction: ChatInputCommandInteraction,
        _client: MeloraClient,
    ): Promise<boolean> {
        const member = interaction.member as GuildMember | null;
        const vc = member?.voice?.channel;

        if (!vc) {
            await SafetyChecks.sendError(interaction, 'You must be in a voice channel to use this command.');
            return false;
        }

        return true;
    }

    static async requireBotPermissions(
        interaction: ChatInputCommandInteraction,
        _client: MeloraClient,
    ): Promise<boolean> {
        const member = interaction.member as GuildMember | null;
        const vc = member?.voice?.channel;
        if (!vc) return false;

        let me = interaction.guild?.members.me;
        if (!me && interaction.guild) {
            try {
                me = await interaction.guild.members.fetch(interaction.client.user.id);
            } catch {
                return false;
            }
        }
        if (!me) return false;

        const perms = vc.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
            await SafetyChecks.sendError(interaction, 'I need **View Channel**, **Connect**, and **Speak** permissions in your voice channel.');
            return false;
        }

        return true;
    }

    static async requireSameChannel(
        interaction: ChatInputCommandInteraction,
        client: MeloraClient,
    ): Promise<boolean> {
        const member = interaction.member as GuildMember | null;
        const session = client.music.getSession(interaction.guildId ?? '');
        if (!session?.voiceChannel) return true;

        if (member?.voice?.channelId !== session.voiceChannel.id) {
            await SafetyChecks.sendError(interaction, 'You must be in the same voice channel as the bot.');
            return false;
        }

        return true;
    }



    // Note: These checks are now only useful for manual invocation, 
    // because CommandHandler.ts strictly passes `(interaction, client)`.
    static async requireDuration(
        interaction: ChatInputCommandInteraction,
        client: MeloraClient,
        durationMs: number = 0,
    ): Promise<boolean> {
        if (interaction.user.id === config.ownerId) return true;

        if (!interaction.guildId || durationMs === 0) return true;
        const settings = await client.settings.getSettings(interaction.guildId);
        if (durationMs > settings.maxDuration) {
            await SafetyChecks.sendError(interaction, `Track exceeds the maximum duration of **${Math.floor(settings.maxDuration / 60000)} minutes**.`);
            return false;
        }
        return true;
    }

    static async requireQueueSpace(
        interaction: ChatInputCommandInteraction,
        client: MeloraClient,
        count = 1,
    ): Promise<boolean> {
        if (interaction.user.id === config.ownerId) return true;

        if (!interaction.guildId) return true;
        const settings = await client.settings.getSettings(interaction.guildId);
        const session = client.music.getSession(interaction.guildId);

        const currentSize = session ? session.queue.size : 0;
        if (currentSize + count > settings.maxQueueSize) {
            await SafetyChecks.sendError(interaction, `Adding **${count}** tracks would exceed the queue limit of **${settings.maxQueueSize}** (Current: ${currentSize}).`);
            return false;
        }
        return true;
    }

    static async requirePlaying(
        interaction: ChatInputCommandInteraction,
        client: MeloraClient,
    ): Promise<boolean> {
        const session = client.music.getSession(interaction.guildId ?? '');
        if (!session?.isPlaying) {
            await SafetyChecks.sendError(interaction, 'Nothing is currently playing.');
            return false;
        }
        return true;
    }

    static async requireRestricted(
        interaction: ChatInputCommandInteraction,
        client: MeloraClient,
    ): Promise<boolean> {
        if (interaction.user.id === config.ownerId) return true;

        if (!interaction.guildId) return true;
        const settings = await client.settings.getSettings(interaction.guildId);
        if (!settings.restricted && !settings.djOnly) return true;

        const isDj = await client.permissions.isDj(interaction);
        if (isDj) return true;

        if (settings.restricted) {
            await SafetyChecks.sendError(interaction, 'This server is in **restricted mode**. Only DJs and above can use music commands.');
        } else if (settings.djOnly) {
            await SafetyChecks.sendError(interaction, 'This server has **DJ-Only mode** enabled. Only DJs and above can manage music.');
        }

        return false;
    }

    static async requireVoiceCapacity(
        interaction: ChatInputCommandInteraction,
        _client: MeloraClient,
    ): Promise<boolean> {
        const member = interaction.member as GuildMember | null;
        const vc = member?.voice?.channel;
        if (!vc) return true;

        let me = interaction.guild?.members.me;
        if (!me && interaction.guild) {
            try {
                me = await interaction.guild.members.fetch(interaction.client.user.id);
            } catch {
                // ignore
            }
        }
        if (me?.voice?.channelId === vc.id) return true; // Bot already in VC

        if (vc.userLimit > 0 && vc.members.size >= vc.userLimit) {
            await SafetyChecks.sendError(interaction, 'The voice channel is full.');
            return false;
        }

        return true;
    }
}
