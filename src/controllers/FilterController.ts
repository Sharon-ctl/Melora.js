import type { CommandContext } from './CommandContext.js';

const VALID_FILTERS = ['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'tremolo', 'vibrato', 'distortion', 'lowpass'];

export class FilterController {

    static async addFilter(context: CommandContext, name: string): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }

        const filterName = name.toLowerCase();
        if (!VALID_FILTERS.includes(filterName)) {
            await context.reply(`Unknown filter. Available: ${VALID_FILTERS.join(', ')}`, true);
            return;
        }

        if (!context.client.filters.canAddFilter(context.guild.id)) {
            await context.reply('Filter stack is full — remove one first.', true);
            return;
        }

        const payload = context.client.filters.addFilter(context.guild.id, filterName);
        await session.player?.setFilters(payload);
        await context.tempReply(`Filter **${filterName}** applied.`);
    }

    static async removeFilter(context: CommandContext, name: string): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }

        const filterName = name.toLowerCase();
        const payload = context.client.filters.removeFilter(context.guild.id, filterName);
        await session.player?.setFilters(payload);
        await context.tempReply(`Filter **${filterName}** removed.`);
    }

    static async resetFilters(context: CommandContext): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }

        context.client.filters.resetFilters(context.guild.id);
        await session.player?.clearFilters();
        await context.tempReply('All filters cleared.');
    }

    static async listFilters(context: CommandContext): Promise<void> {
        const active = context.client.filters.getActiveFilters(context.guild.id);
        if (active.length === 0) {
            await context.reply('No filters active.', true);
        } else {
            const list = active.map((f) => `- ${f}`).join('\n');
            await context.reply(`**Active Filters**\n${list}`);
        }
    }

    // EQ presets
    static async eqPreset(context: CommandContext, presetName: string): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }

        const preset = context.client.filters.getEqPreset(presetName);
        if (!preset) {
            await context.reply('Unknown preset. Available: bass, pop, rock, electronic, flat', true);
            return;
        }
        const payload = context.client.filters.buildEqPayload(preset);
        await session.player?.setFilters(payload);
        await context.tempReply(`EQ preset **${presetName}** applied.`);
    }

    // Speed and pitch (wraps timescale filter)
    static async speed(context: CommandContext, speedVal: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        if (isNaN(speedVal) || speedVal < 0.25 || speedVal > 3.0) {
            await context.reply('Provide speed between 0.25 and 3.0.', true);
            return;
        }
        await session.player?.setFilters({ timescale: { speed: speedVal } });
        await context.tempReply(`Speed set to **${speedVal}x**.`);
    }

    static async pitch(context: CommandContext, pitchVal: number): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }
        if (isNaN(pitchVal) || pitchVal < 0.25 || pitchVal > 3.0) {
            await context.reply('Provide pitch between 0.25 and 3.0.', true);
            return;
        }
        await session.player?.setFilters({ timescale: { pitch: pitchVal } });
        await context.tempReply(`Pitch set to **${pitchVal}**.`);
    }

    static async eqCustom(context: CommandContext, bandsRaw: string): Promise<void> {
        const session = context.client.music.getSession(context.guild.id);
        if (!session || !session.isPlaying) {
            await context.reply('Nothing is playing.');
            return;
        }

        const bands = bandsRaw.split(/[,\s]+/).map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        if (bands.length !== 15) {
            await context.reply('Provide exactly 15 gain values (-0.25 to 1.0), separated by commas or spaces.', true);
            return;
        }
        const clamped = bands.map(v => Math.max(-0.25, Math.min(1.0, v)));
        const payload = context.client.filters.buildEqPayload(clamped);
        await session.player?.setFilters(payload);
        await context.tempReply('Custom EQ applied.');
    }
}
