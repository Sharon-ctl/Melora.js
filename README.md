# Melora

[![CI](https://github.com/Sharon-ctl/Melora.js/actions/workflows/ci.yml/badge.svg)](https://github.com/Sharon-ctl/Melora.js/actions/workflows/ci.yml)

Melora is a lightweight, high-performance Discord music bot built for stability and simplicity. It uses TypeScript and Lavalink to provide a seamless audio experience without the bloat.

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
npm install
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
