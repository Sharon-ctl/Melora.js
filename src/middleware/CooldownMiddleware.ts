import {
    type ChatInputCommandInteraction,
    Collection,
} from 'discord.js';

interface CooldownEntry {
    expiresAt: number;
}

const SWEEP_INTERVAL_MS = 30000; // 30 seconds

export class CooldownMiddleware {
    private readonly cooldowns = new Collection<string, CooldownEntry>();
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    }

    check(interaction: ChatInputCommandInteraction, cooldownSeconds: number): boolean {
        const key = `${interaction.user.id}:${interaction.commandName}`;
        const existing = this.cooldowns.get(key);
        const now = Date.now();

        if (existing && existing.expiresAt > now) {
            const remainingMs = existing.expiresAt - now;
            const remainingSec = Math.ceil(remainingMs / 1000);

            void interaction.reply({
                content: `**Cooldown**\nPlease wait **${remainingSec}s** before using \`/${interaction.commandName}\` again.`,
                ephemeral: true,
            });
            return false;
        }

        this.cooldowns.set(key, { expiresAt: now + cooldownSeconds * 1000 });
        return true;
    }

    private sweep(): void {
        const now = Date.now();
        this.cooldowns.sweep((entry) => entry.expiresAt <= now);
    }

    destroy(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        this.cooldowns.clear();
    }
}
