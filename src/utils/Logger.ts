import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { appendFile } from 'fs/promises';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

const LEVEL_LABELS: Record<LogLevel, string> = {
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.DEBUG]: 'DEBUG',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
    [LogLevel.ERROR]: '\x1b[31m',
    [LogLevel.WARN]: '\x1b[33m',
    [LogLevel.INFO]: '\x1b[36m',
    [LogLevel.DEBUG]: '\x1b[90m',
};

const RESET = '\x1b[0m';

export interface ErrorEntry {
    timestamp: string;
    context: string;
    message: string;
}

interface LoggerConfig {
    logToFile: boolean;
    logDir: string;
    maxLogFiles: number;
}

export class Logger {
    private static minLevel: LogLevel = LogLevel.INFO;
    private static config: LoggerConfig = {
        logToFile: false,
        logDir: join(process.cwd(), 'logs'),
        maxLogFiles: 7,
    };
    private static currentDate = '';
    private static readonly MAX_ERRORS = 50;
    private static errorRing: ErrorEntry[] = [];

    static setLevel(level: 'info' | 'warn' | 'error' | 'debug'): void {
        const map: Record<string, LogLevel> = {
            debug: LogLevel.DEBUG,
            info: LogLevel.INFO,
            warn: LogLevel.WARN,
            error: LogLevel.ERROR,
        };
        Logger.minLevel = map[level] ?? LogLevel.INFO;
    }

    static enableFileLogging(options?: Partial<LoggerConfig>): void {
        Logger.config.logToFile = true;
        if (options?.logDir) Logger.config.logDir = options.logDir;
        if (options?.maxLogFiles) Logger.config.maxLogFiles = options.maxLogFiles;

        if (!existsSync(Logger.config.logDir)) {
            mkdirSync(Logger.config.logDir, { recursive: true });
        }

        Logger.currentDate = Logger.getDateString();
        Logger.rotateIfNeeded();
    }

    static debug(context: string, message: string): void {
        Logger.log(LogLevel.DEBUG, context, message);
    }

    static info(context: string, message: string): void {
        Logger.log(LogLevel.INFO, context, message);
    }

    static warn(context: string, message: string): void {
        Logger.log(LogLevel.WARN, context, message);
    }

    static error(context: string, message: string, error?: Error): void {
        Logger.log(LogLevel.ERROR, context, message);

        // Push to error ring buffer
        Logger.errorRing.push({
            timestamp: new Date().toISOString(),
            context,
            message: error ? `${message} — ${error.message}` : message,
        });
        if (Logger.errorRing.length > Logger.MAX_ERRORS) {
            Logger.errorRing.shift();
        }

        if (error?.stack && Logger.minLevel >= LogLevel.ERROR) {
            process.stderr.write(`${error.stack}\n`);
            if (Logger.config.logToFile) {
                Logger.writeToFile('error', `${error.stack}\n`);
            }
        }
    }

    static getRecentErrors(count: number = 20): ErrorEntry[] {
        return Logger.errorRing.slice(-count);
    }

    private static log(level: LogLevel, context: string, message: string): void {
        if (level > Logger.minLevel) return;
        const timestamp = new Date().toISOString();
        const color = LEVEL_COLORS[level];
        const label = LEVEL_LABELS[level];

        // Console output (colored)
        const consoleOutput = `${color}[${timestamp}] [${label}] [${context}]${RESET} ${message}\n`;
        if (level === LogLevel.ERROR) {
            process.stderr.write(consoleOutput);
        } else {
            process.stdout.write(consoleOutput);
        }

        // File output (plain text)
        if (Logger.config.logToFile) {
            const plainOutput = `[${timestamp}] [${label}] [${context}] ${message}\n`;
            Logger.writeToFile('combined', plainOutput);
            if (level === LogLevel.ERROR) {
                Logger.writeToFile('error', plainOutput);
            }
        }
    }

    private static writeBuffer: Map<string, string[]> = new Map();
    private static flushTimer: NodeJS.Timeout | null = null;

    private static writeToFile(type: 'combined' | 'error', content: string): void {
        // Buffer writes instead of synchronous I/O on every log line
        const today = Logger.getDateString();
        if (today !== Logger.currentDate) {
            Logger.currentDate = today;
            Logger.rotateIfNeeded();
        }

        const filename = `${type}-${Logger.currentDate}.log`;
        const key = filename;

        if (!Logger.writeBuffer.has(key)) {
            Logger.writeBuffer.set(key, []);
        }
        Logger.writeBuffer.get(key)!.push(content);

        // Schedule a flush every 2 seconds (batches many writes into one I/O op)
        if (!Logger.flushTimer) {
            Logger.flushTimer = setTimeout(() => void Logger.flushBuffers(), 2000);
        }
    }

    private static async flushBuffers(): Promise<void> {
        Logger.flushTimer = null;
        const entries = [...Logger.writeBuffer.entries()];
        Logger.writeBuffer.clear();

        for (const [filename, lines] of entries) {
            if (lines.length === 0) continue;
            const filepath = join(Logger.config.logDir, filename);
            try {
                await appendFile(filepath, lines.join(''));
            } catch {
                // Silently fail — can't log a logging failure
            }
        }
    }

    private static rotateIfNeeded(): void {
        try {
            const files = readdirSync(Logger.config.logDir)
                .filter((f) => f.endsWith('.log'))
                .sort();

            // Group by type
            for (const type of ['combined', 'error'] as const) {
                const typeFiles = files.filter((f) => f.startsWith(type));
                while (typeFiles.length > Logger.config.maxLogFiles) {
                    const oldest = typeFiles.shift();
                    if (oldest) {
                        unlinkSync(join(Logger.config.logDir, oldest));
                    }
                }
            }
        } catch {
            // Silently fail
        }
    }

    private static getDateString(): string {
        return new Date().toISOString().slice(0, 10);
    }
}
