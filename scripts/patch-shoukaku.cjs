/**
 * postinstall patch for Shoukaku 4.2.0
 * Adds the missing `channelId` field to voice update payloads
 * required by Lavalink v4.x.
 *
 * Shoukaku's Player.sendServerUpdate() and Player.data getter omit
 * channelId from the `voice` object, causing Lavalink 4.x to reject
 * the PATCH with "Field 'channelId' is required".
 */

const fs = require('fs');
const path = require('path');

const FILES = [
    path.join(__dirname, '..', 'node_modules', 'shoukaku', 'dist', 'index.js'),
    path.join(__dirname, '..', 'node_modules', 'shoukaku', 'dist', 'index.mjs'),
];

// The pattern that appears in both get data() and sendServerUpdate():
//   sessionId: connection.sessionId
// needs to become:
//   sessionId: connection.sessionId,
//   channelId: connection.channelId
const SEARCH = 'sessionId: connection.sessionId\n';
const REPLACE = 'sessionId: connection.sessionId,\n          channelId: connection.channelId\n';

let patchedCount = 0;

for (const filePath of FILES) {
    if (!fs.existsSync(filePath)) {
        console.log(`[patch-shoukaku] Skipping (not found): ${filePath}`);
        continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const occurrences = (content.match(new RegExp(SEARCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    if (occurrences === 0) {
        console.log(`[patch-shoukaku] Already patched or pattern not found: ${path.basename(filePath)}`);
        continue;
    }

    content = content.split(SEARCH).join(REPLACE);
    fs.writeFileSync(filePath, content, 'utf8');
    patchedCount++;
    console.log(`[patch-shoukaku] Patched ${path.basename(filePath)} (${occurrences} locations)`);
}

if (patchedCount > 0) {
    console.log(`[patch-shoukaku] Done — ${patchedCount} file(s) patched.`);
} else {
    console.log('[patch-shoukaku] No files needed patching.');
}
