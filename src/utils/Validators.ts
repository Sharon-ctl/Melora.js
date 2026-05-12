const URL_REGEX = /^https?:\/\/.+/i;
const DURATION_REGEX = /^(\d+):([0-5]\d)$/;

export class Validators {
    static isValidUrl(input: string): boolean {
        return URL_REGEX.test(input);
    }

    static parseDuration(input: string): number | null {
        const match = DURATION_REGEX.exec(input);
        if (!match) return null;
        const minutes = parseInt(match[1]!, 10);
        const seconds = parseInt(match[2]!, 10);
        return minutes * 60 + seconds;
    }

    static isInRange(value: number, min: number, max: number): boolean {
        return value >= min && value <= max;
    }

    static clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    static sanitizeString(input: string, maxLength: number): string {
        return input.slice(0, maxLength).trim();
    }

    static isPositiveInteger(value: number): boolean {
        return Number.isInteger(value) && value > 0;
    }

    static formatDuration(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    static formatUptime(ms: number): string {
        const seconds = Math.floor(ms / 1000) % 60;
        const minutes = Math.floor(ms / (1000 * 60)) % 60;
        const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));

        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        return parts.join(' ');
    }

    static truncate(text: string, maxLen: number): string {
        if (text.length <= maxLen) return text;
        return text.slice(0, maxLen - 3) + '...';
    }
}
