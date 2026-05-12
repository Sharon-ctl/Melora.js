import {
    type ChatInputCommandInteraction,
} from 'discord.js';
import { Logger } from './Logger.js';

export class ErrorHandler {
    static createErrorResponse(title: string, description: string) {
        return {
            content: `**${title}**\n${description}`,
            ephemeral: true,
        };
    }

    /**
     * Sanitize an error message for user display — strip file paths, stack traces,
     * and internal module names to prevent information leakage.
     */
    private static sanitizeMessage(message: string): string {
        // Strip absolute file paths (Unix and Windows)
        let sanitized = message.replace(/(?:\/[\w.-]+)+\.(?:ts|js|mjs)/g, '[internal]');
        sanitized = sanitized.replace(/[A-Z]:\\[\w\\.-]+\.(?:ts|js|mjs)/gi, '[internal]');
        // Strip stack trace lines
        sanitized = sanitized.replace(/\s+at\s+.+/g, '');
        // Strip node_modules references
        sanitized = sanitized.replace(/node_modules[\\/][^\s]+/g, '[dependency]');
        // Truncate to reasonable length
        if (sanitized.length > 200) {
            sanitized = sanitized.slice(0, 200) + '…';
        }
        return sanitized.trim() || 'An unexpected error occurred.';
    }

    static async handleInteractionError(
        interaction: ChatInputCommandInteraction,
        error: unknown,
    ): Promise<void> {
        let title = 'Command Error';
        let message = 'An unexpected error occurred.';

        if (error instanceof Error) {
            message = error.message;
            if (error.name === 'QueueLimitExceededError') {
                title = 'Queue Limit Reached';
            } else if (error.name === 'GlobalRateLimitError') {
                title = 'Rate Limit';
            }
        }

        // Log the full error internally
        if (title !== 'Command Error') {
            Logger.warn('ErrorHandler', `Handled expected error: ${title} - ${message}`);
        } else {
            Logger.error('ErrorHandler', `Interaction error in /${interaction.commandName}`, error instanceof Error ? error : undefined);
        }

        // Sanitize before sending to user
        const userMessage = ErrorHandler.sanitizeMessage(message);
        const response = ErrorHandler.createErrorResponse(title, userMessage);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(response);
            } else {
                await interaction.reply(response);
            }
        } catch {
            Logger.error('ErrorHandler', 'Failed to send error response to user');
        }
    }

    static registerGlobalHandlers(): void {
        process.on('unhandledRejection', (reason: unknown) => {
            const err = reason instanceof Error ? reason : new Error(String(reason));
            Logger.error('Process', 'Unhandled rejection', err);
        });

        process.on('uncaughtException', (error: Error) => {
            Logger.error('Process', 'Uncaught exception', error);
        });
    }
}
