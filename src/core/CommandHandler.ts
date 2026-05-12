import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../utils/Logger.js';
import type { MeloraClient } from './Client.js';
import type { SlashCommand } from '../types/index.js';
import { config } from '../config/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COMMAND_CATEGORIES = [
    'playback', 'queue', 'filters', 'playlists', 'settings', 'utility',
];

export class CommandHandler {
    private readonly client: MeloraClient;

    constructor(client: MeloraClient) {
        this.client = client;
    }

    async loadCommands(): Promise<void> {
        const commandsDir = join(__dirname, '..', 'commands');

        for (const category of COMMAND_CATEGORIES) {
            const categoryPath = join(commandsDir, category);
            let files: string[];
            try {
                files = readdirSync(categoryPath).filter(
                    (f) => (f.endsWith('.js') || f.endsWith('.ts')) && !f.endsWith('.d.ts'),
                );
            } catch {
                Logger.warn('CommandHandler', `Category folder not found: ${category}`);
                continue;
            }

            for (const file of files) {
                const filePath = join(categoryPath, file);
                const module = await import(`file://${filePath.replace(/\\/g, '/')}`) as { default?: SlashCommand; command?: SlashCommand };
                const command = module.default ?? module.command;
                if (!command?.data) {
                    Logger.warn('CommandHandler', `Skipping invalid command file: ${file}`);
                    continue;
                }
                command.category = category;
                this.client.commands.set(command.data.name, command);
            }
        }

        Logger.info('CommandHandler', `Loaded ${this.client.commands.size} commands`);
    }

    async registerCommands(): Promise<void> {
        const rest = new REST({ version: '10' }).setToken(config.token);
        const commandData: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

        this.client.commands.forEach((cmd) => {
            commandData.push(cmd.data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody);
        });

        const clientId = this.client.user?.id;
        if (!clientId) {
            Logger.error('CommandHandler', 'Client user not available for command registration');
            return;
        }

        await rest.put(Routes.applicationCommands(clientId), { body: commandData });
        Logger.info('CommandHandler', `Registered ${commandData.length} slash commands globally`);
    }
}

