import 'dotenv/config';

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function validate() {
    const commandsDir = join(__dirname, '..', 'src', 'commands');
    // Including 'info' to check the new ones
    const categories = ['playback', 'queue', 'filters', 'playlists', 'settings', 'stats', 'utility', 'admin', 'info'];

    for (const cat of categories) {
        const catPath = join(commandsDir, cat);
        let files: string[] = [];
        try {
            files = readdirSync(catPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
        } catch {
            console.warn(`Skipping missing category: ${cat}`);
            continue;
        }

        for (const file of files) {
            try {
                const mod = await import(`file://${join(catPath, file).replace(/\\/g, '/')}`);
                const cmd = mod.default ?? mod.command;

                if (!cmd?.data) {
                    console.error(`❌ ${cat}/${file}: Missing data property`);
                    continue;
                }

                const json = cmd.data.toJSON();

                // Checks
                if (!json.name.match(/^[\w-]{1,32}$/)) {
                    console.error(`❌ ${cat}/${file}: Invalid name "${json.name}"`);
                }
                if (json.name !== json.name.toLowerCase()) {
                    console.error(`❌ ${cat}/${file}: Name must be lowercase`);
                }
                if (json.description.length > 100 || json.description.length === 0) {
                    console.error(`❌ ${cat}/${file}: Invalid description length (${json.description.length})`);
                }

                console.log(`✅ ${cat}/${file} OK`);
            } catch (e) {
                console.error(`❌ ${cat}/${file}: Failed to load - ${e}`);
            }
        }
    }
}

validate().catch(console.error);
