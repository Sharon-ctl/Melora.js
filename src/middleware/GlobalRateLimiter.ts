import { GlobalRateLimitError } from '../errors/BotErrors.js';
import { Logger } from '../utils/Logger.js';
import { config } from '../config/config.js';

export class GlobalRateLimiter {
    private static readonly WINDOW_MS = 10000; // 10 seconds
    private static readonly MAX_REQUESTS = 10;
    private static readonly SWEEP_INTERVAL_MS = 60000; // 60 seconds
    private static userTimestamps = new Map<string, number[]>();
    private static sweepTimer: ReturnType<typeof setInterval> | null = null;

    static init(): void {
        if (GlobalRateLimiter.sweepTimer) return;
        GlobalRateLimiter.sweepTimer = setInterval(() => GlobalRateLimiter.sweep(), GlobalRateLimiter.SWEEP_INTERVAL_MS);
    }

    static destroy(): void {
        if (GlobalRateLimiter.sweepTimer) {
            clearInterval(GlobalRateLimiter.sweepTimer);
            GlobalRateLimiter.sweepTimer = null;
        }
        GlobalRateLimiter.userTimestamps.clear();
    }

    static check(userId: string): void {
        const now = Date.now();

        // Owner bypass
        if (config.ownerId === userId) return;

        let timestamps = this.userTimestamps.get(userId) || [];

        // Remove old timestamps
        timestamps = timestamps.filter(t => now - t < this.WINDOW_MS);

        if (timestamps.length >= this.MAX_REQUESTS) {
            Logger.warn('RateLimiter', `User ${userId} limit exceeded`);
            throw new GlobalRateLimitError();
        }

        timestamps.push(now);
        this.userTimestamps.set(userId, timestamps);
    }

    private static sweep(): void {
        const now = Date.now();
        const staleThreshold = now - GlobalRateLimiter.WINDOW_MS * 2;
        for (const [key, ts] of GlobalRateLimiter.userTimestamps) {
            if (ts.length === 0 || ts[ts.length - 1]! < staleThreshold) {
                GlobalRateLimiter.userTimestamps.delete(key);
            }
        }
    }
}

