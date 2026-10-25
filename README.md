# Melora

[![CI](https://github.com/Sharon-ctl/Melora.js/actions/workflows/ci.yml/badge.svg)](https://github.com/Sharon-ctl/Melora.js/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-8%20passing-brightgreen?style=flat-square&logo=npm&logoColor=white)](https://github.com/Sharon-ctl/Melora.js/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-14.27.0-5865F2?style=flat-square&logo=discord&logoColor=white)](https://www.npmjs.com/package/discord.js)
[![Shoukaku](https://img.shields.io/badge/Shoukaku-4.3.0-0A7EA4?style=flat-square&logo=musicbrainz&logoColor=white)](https://www.npmjs.com/package/shoukaku)

Melora is a lightweight, high-performance Discord music bot built for stability and simplicity. It uses TypeScript and Lavalink to provide a seamless audio experience without the bloat.

## Packages

Direct dependency versions below are the versions resolved in [`package-lock.json`](package-lock.json). Use `npm ci` to install the locked dependency tree reproducibly.

| Package | Version | Scope | Used for |
| --- | --- | --- | --- |
| [discord.js](https://www.npmjs.com/package/discord.js) | 14.27.0 | Runtime | Discord API, commands, and interactions |
| [Shoukaku](https://www.npmjs.com/package/shoukaku) | 4.3.0 | Runtime | Lavalink node connections and audio playback |
| [dotenv](https://www.npmjs.com/package/dotenv) | 16.6.1 | Runtime | Environment-based configuration |
| [TypeScript](https://www.npmjs.com/package/typescript) | 5.9.3 | Development | Type checking and compilation |
| [ts-node](https://www.npmjs.com/package/ts-node) | 10.9.2 | Development | TypeScript development and command deployment |
| [ts-morph](https://www.npmjs.com/package/ts-morph) | 27.0.2 | Development | TypeScript source tooling |
| [@types/node](https://www.npmjs.com/package/@types/node) | 22.20.5 | Development | Node.js type definitions |

Dependabot checks npm and GitHub Actions dependencies weekly; CI runs `npm test` on pushes and pull requests.

## Features

- Fast and responsive playback
- Fully relies on slash commands for a clean interface
- Built-in queue management and playback controls
- Lightweight architecture optimized for performance
- Simple global history tracking

## Quick Start

### 1. Prerequisites
- Node.js 22 or higher
- A running Lavalink v4 server
- A registered Discord bot application

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone <your-repo-link>
cd melora
npm ci
```

Register the slash commands with Discord after setting up `.env`:

```bash
npm run deploy
```

### 3. Configuration
Create a .env file in the root directory. You can use the provided .env.example as a template:
```env
DISCORD_TOKEN="YOUR_DISCORD_BOT_TOKEN_HERE"
BOT_OWNER_ID="YOUR_DISCORD_USER_ID_HERE"
LAVALINK_NODES="MeloLink|localhost|2333|youshallnotpass"
```

### 4. Launch
Build and start the bot:
```bash
npm run build
npm start
```

## Commands
Melora includes playback and queue controls, playlists, filters, saved favorites, personal listening history and stats, and a standalone `/search` command that finds tracks without queuing them. Type `/` in your Discord server to see the registered commands.

## Development

Run the automated unit suite with `npm test`. It compiles the TypeScript project and covers queue rules and per-user listening history.

## License
Licensed under the MIT License.
