import type { MeloraClient } from '../core/Client.js';

export interface FilterPreset {
    name: string;
    values: Record<string, unknown>;
}

const EQ_PRESETS: Record<string, number[]> = {
    bassboost: [0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Refined: Much milder
    party: [0.4, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [0.6, 0.7, 0.8, 0.55, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Kept "Legacy" bass for extreme users
    pop: [0.1, 0.15, 0.2, 0.1, 0, -0.05, -0.1, -0.05, 0.1, 0.15, 0.2, 0.15, 0.1, 0.05, 0],
    rock: [0.3, 0.25, 0.2, 0.1, -0.05, -0.1, -0.05, 0.1, 0.25, 0.3, 0.35, 0.3, 0.25, 0.2, 0.15],
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    electronic: [0.4, 0.35, 0.1, -0.05, -0.1, 0, 0.1, 0.15, 0.2, 0.25, 0.35, 0.4, 0.35, 0.3, 0.25],
    loudness: [0.2, 0.15, 0.1, 0.05, 0.0, -0.05, -0.05, 0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.3], // V-shape for clarity
};

const FILTER_PRESETS: Record<string, Record<string, unknown>> = {
    bassboost: {
        equalizer: [
            { band: 0, gain: 0.2 },
            { band: 1, gain: 0.3 },
            { band: 2, gain: 0.4 },
            { band: 3, gain: 0.3 },
            { band: 4, gain: 0.2 },
        ]
    },
    nightcore: { timescale: { speed: 1.25, pitch: 1.3, rate: 1.0 } },
    vaporwave: { timescale: { speed: 0.85, pitch: 0.8, rate: 1.0 } },
    '8d': { rotation: { rotationHz: 0.2 } },
    karaoke: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
    tremolo: { tremolo: { frequency: 2.0, depth: 0.5 } },
    vibrato: { vibrato: { frequency: 2.0, depth: 0.5 } },
    distortion: { distortion: { sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1, tanOffset: 0, tanScale: 1 } },
    lowpass: { lowPass: { smoothing: 20.0 } },
};

const MAX_FILTER_STACK = 5;

export class FilterManager {
    private readonly activeFilters = new Map<string, Set<string>>();

    constructor(_client: MeloraClient) {
        // Client reserved for future use
    }

    getEqPresetNames(): string[] {
        return Object.keys(EQ_PRESETS);
    }

    getFilterPresetNames(): string[] {
        return Object.keys(FILTER_PRESETS);
    }

    getEqPreset(name: string): number[] | null {
        return EQ_PRESETS[name] ?? null;
    }

    getFilterPreset(name: string): Record<string, unknown> | null {
        return FILTER_PRESETS[name] ?? null;
    }

    getActiveFilters(guildId: string): string[] {
        const set = this.activeFilters.get(guildId);
        return set ? [...set] : [];
    }

    canAddFilter(guildId: string): boolean {
        const set = this.activeFilters.get(guildId);
        return !set || set.size < MAX_FILTER_STACK;
    }

    addFilter(guildId: string, filterName: string): Record<string, unknown> {
        let set = this.activeFilters.get(guildId);
        if (!set) {
            set = new Set();
            this.activeFilters.set(guildId, set);
        }
        set.add(filterName);

        return this.buildFilterPayload(set);
    }

    removeFilter(guildId: string, filterName: string): Record<string, unknown> {
        const set = this.activeFilters.get(guildId);
        if (set) {
            set.delete(filterName);
            if (set.size === 0) this.activeFilters.delete(guildId);
        }
        return this.buildFilterPayload(set);
    }

    resetFilters(guildId: string): void {
        this.activeFilters.delete(guildId);
    }

    buildEqPayload(bands: number[]): Record<string, unknown> {
        return {
            equalizer: bands.map((gain, band) => ({ band, gain })),
        };
    }

    private buildFilterPayload(activeSet?: Set<string>): Record<string, unknown> {
        const combined: Record<string, unknown> = {};
        if (!activeSet) return combined;

        for (const name of activeSet) {
            const preset = FILTER_PRESETS[name];
            if (preset) {
                Object.assign(combined, preset);
            }
        }
        return combined;
    }
}
