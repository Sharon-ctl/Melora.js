import type { CommandContext } from './CommandContext.js';

export class AdminController {

    static async toggle247(context: CommandContext): Promise<void> {
        let session = context.client.music.getSession(context.guild.id);

        if (!session) {
            if (!context.member.voice?.channel) {
                await context.reply('You must be in a voice channel to enable 24/7 mode.', true);
                return;
            }
            try {
                session = await context.client.music.createSession(
                    context.guild.id,
                    context.member.voice.channel,
                    context.channel
                );
            } catch (error) {
                await context.reply(`Failed to join voice channel: ${(error as Error).message}`);
                return;
            }
        }

        session.is247 = !session.is247;
        await context.tempReply(`24/7 mode **${session.is247 ? 'enabled' : 'disabled'}**.`);
    }

    static async djOnly(context: CommandContext, enabled?: boolean): Promise<void> {
        const settings = await context.client.settings.getSettings(context.guild.id);

        if (enabled === undefined) {
            // Toggle
            enabled = !settings.djOnly;
        }

        settings.djOnly = enabled;
        await context.client.settings.saveSettings(context.guild.id, settings);
        await context.tempReply(`DJ-only mode **${enabled ? 'enabled' : 'disabled'}**.`);
    }
}
