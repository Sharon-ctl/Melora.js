import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CommandModule {
    default?: { data: { toJSON(): unknown } };
    command?: { data: { toJSON(): unknown } };
}

async function deploy(): Promise<void> {
    const token = process.env['DISCORD_TOKEN'];
    if (!token) {
        console.error('DISCORD_TOKEN is required');
        process.exit(1);
    }

    const rest = new REST({ version: '10' }).setToken(token);

    const commandsDir = join(__dirname, '..', 'src', 'commands');
    const categories = ['playback', 'queue', 'filters', 'playlists', 'settings', 'stats', 'utility', 'admin', 'info'];
    const commands: unknown[] = [];

    for (const cat of categories) {
        const catPath = join(commandsDir, cat);
        let files: string[];
        try {
            files = readdirSync(catPath).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
        } catch {
            continue;
        }

        for (const file of files) {
            const mod = await import(`file://${join(catPath, file).replace(/\\/g, '/')}`) as CommandModule;
            const cmd = mod.default ?? mod.command;
            if (cmd?.data) {
                commands.push(cmd.data.toJSON());
            }
        }
    }

    console.log(`Deploying ${commands.length} commands...`);

    const me = await rest.get(Routes.user()) as { id: string };
    await rest.put(Routes.applicationCommands(me.id), { body: commands });

    console.log(`Successfully deployed ${commands.length} commands globally.`);
}

deploy().catch((err) => {
    console.error('Deployment failed!');
    try {
        writeFileSync('deploy_error.json', JSON.stringify(err, null, 2));
    } catch { }
    console.error(err);
    process.exit(1);
});
