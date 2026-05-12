# Melora

Melora is a lightweight, high-performance Discord music bot built for stability and simplicity. It uses TypeScript and Lavalink to provide a seamless audio experience without the bloat.

## Features

- Fast and responsive playback
- Fully relies on slash commands for a clean interface
- Built-in queue management and playback controls
- Lightweight architecture optimized for performance
- Simple global history tracking

## Quick Start

### 1. Prerequisites
- Node.js 18.0.0 or higher
- A running Lavalink v4 server
- A registered Discord bot application

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone <your-repo-link>
cd melora
npm install
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
Melora keeps things simple with easy to use commands for playback, queue management, and basic settings. Type / in your Discord server to see all available commands.

## License
Licensed under the MIT License.
