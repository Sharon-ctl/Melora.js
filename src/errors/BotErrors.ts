export class QueueLimitExceededError extends Error {
    constructor(public readonly limit: number) {
        super(`Queue limit reached (${limit} tracks).`);
        this.name = 'QueueLimitExceededError';
    }
}

export class GlobalRateLimitError extends Error {
    constructor() {
        super('Global rate limit exceeded. Please wait a moment.');
        this.name = 'GlobalRateLimitError';
    }
}
