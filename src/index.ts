import { MeloraClient } from './core/Client.js';
import { CommandHandler } from './core/CommandHandler.js';
import { EventHandler } from './core/EventHandler.js';
import { ErrorHandler } from './utils/ErrorHandler.js';
import { Logger } from './utils/Logger.js';
import { GlobalRateLimiter } from './middleware/GlobalRateLimiter.js';
import { config } from './config/config.js';

async function main(): Promise<void> {
    ErrorHandler.registerGlobalHandlers();
    Logger.setLevel(config.logLevel);

    // Suppress the 'ready' deprecation warning from discord.js/Shoukaku internals
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = function (warning: string | Error, ...args: unknown[]) {
        if (typeof warning === 'string' && warning.includes('The ready event has been renamed to clientReady')) return;
        if (typeof warning === 'object' && warning.message && warning.message.includes('The ready event has been renamed to clientReady')) return;
        return Reflect.apply(originalEmitWarning, process, [warning, ...args]);
    };

    if (config.logToFile) {
        Logger.enableFileLogging();
    }

    const client = new MeloraClient();

    const commandHandler = new CommandHandler(client);
    await commandHandler.loadCommands();

    const eventHandler = new EventHandler(client);
    eventHandler.registerAll();

    GlobalRateLimiter.init();

    client.once('ready', () => {
        void commandHandler.registerCommands();

        // Restore persisted sessions (24/7 mode, etc.)
        client.queuePersistence.start();
        void client.queuePersistence.restoreAllSessions().catch(e =>
            Logger.warn('Bootstrap', `Session restore failed: ${(e as Error).message}`)
        );
    });

    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        Logger.info('Shutdown', `Received ${signal}, shutting down gracefully…`);



        // Save sessions before destroying them
        try {
            client.queuePersistence.stop();
            await client.queuePersistence.saveAllSessions(true);
            Logger.info('Shutdown', 'Saved active sessions');
        } catch {
            Logger.warn('Shutdown', 'Failed to save sessions');
        }

        // Destroy all active player sessions
        const sessions = client.music.getAllSessions();
        const destroyPromises = sessions.map(async (session) => {
            try {
                await session.destroy(true);
            } catch {
                Logger.warn('Shutdown', `Failed to destroy session ${session.guildId}`);
            }
        });
        await Promise.allSettled(destroyPromises);
        Logger.info('Shutdown', `Destroyed ${sessions.length} active sessions`);

        // Disconnect all Lavalink nodes
        for (const [name, node] of client.shoukaku.nodes) {
            try {
                node.disconnect(1000, 'Bot shutting down');
            } catch {
                Logger.warn('Shutdown', `Failed to disconnect node ${name}`);
            }
        }

        // Close database
        await client.database.close();
        Logger.info('Shutdown', 'Database closed');

        // Clean up middleware timers
        eventHandler.destroy();
        GlobalRateLimiter.destroy();

        // Destroy Discord client
        await client.destroy();
        Logger.info('Shutdown', 'Goodbye!');

        // Force exit if things hang
        setTimeout(() => {
            Logger.warn('Shutdown', 'Force exiting...');
            process.exit(0);
        }, 1000).unref();

        process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    await client.start();
}

main().catch((error) => {
    Logger.error('Bootstrap', 'Failed to start Melora v2', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
});
