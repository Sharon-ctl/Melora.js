import {
    type ChatInputCommandInteraction,
} from 'discord.js';

interface BucketEntry {
    tokens: number;
    lastRefill: number;
}

const MAX_TOKENS = 10;
const REFILL_INTERVAL_MS = 10000; // 10 seconds
const SWEEP_INTERVAL_MS = 60000; // 1 minute

export class RateLimiter {
    private readonly buckets = new Map<string, BucketEntry>();
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    }

    check(interaction: ChatInputCommandInteraction): boolean {
        const guildId = interaction.guildId;
        if (!guildId) return true; // DMs bypass rate limit

        const now = Date.now();
        let bucket = this.buckets.get(guildId);

        if (!bucket) {
            bucket = { tokens: MAX_TOKENS, lastRefill: now };
            this.buckets.set(guildId, bucket);
        }

        // Refill tokens based on elapsed time
        const elapsed = now - bucket.lastRefill;
        if (elapsed >= REFILL_INTERVAL_MS) {
            const refills = Math.floor(elapsed / REFILL_INTERVAL_MS);
            bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refills);
            bucket.lastRefill += refills * REFILL_INTERVAL_MS;
        }

        if (bucket.tokens <= 0) {
            const refillIn = Math.ceil((REFILL_INTERVAL_MS - (now - bucket.lastRefill)) / 1000);

            void interaction.reply({
                content: `**Rate Limited**\nThis server is sending commands too quickly. Try again in **${refillIn}s**.`,
                ephemeral: true,
            });
            return false;
        }

        bucket.tokens--;
        return true;
    }

    private sweep(): void {
        const now = Date.now();
        for (const [key, entry] of this.buckets) {
            if (now - entry.lastRefill > REFILL_INTERVAL_MS * 3) {
                this.buckets.delete(key);
            }
        }
    }

    destroy(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        this.buckets.clear();
    }
}
