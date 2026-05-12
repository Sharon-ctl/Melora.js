# Melora — Ultimate Discord Music Experience

Melora is a premium-grade, modular Discord music bot built for stability, performance, and rich user interaction. Powered by TypeScript and Lavalink, it delivers crystal-clear audio with a state-of-the-art interactive interface.

## ✨ Highlights

- **Hybrid Interaction**: Seamless support for both **Slash Commands** and high-speed **Prefix Commands**.
- **Audiophile Quality**: Full Lavalink v4 integration via Shoukaku for low-latency, high-fidelity playback.
- **Premium UI/UX**: Dynamic "Now Playing" panels, interactive paginated queues, and ultra-responsive button controls.
- **Smart Playback**: Advanced features like Autoplay, Mood-based DJing, and Jam Sessions for continuous music.
- **Robust Security**: Enterprise-ready permission system with tiered access (Owner, Admin, DJ, User).
- **Deep Insights**: Personal "Whispers" (daily/weekly listening recaps) and detailed server-wide music statistics.
- **Resilient Data**: Native PostgreSQL support with an intelligent JSON storage fallback for zero-config setups.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: 18.0.0 or higher
- **Lavalink**: A running Lavalink v4 server
- **Discord Bot**: A registered application with `Message Content` and `Server Members` intents enabled.

### 2. Installation
```bash
git clone <your-repo-link>
cd melora
npm install
```

### 3. Configuration
Create a `.env` file in the root directory based on `.env.example`:
```env
# Required
DISCORD_TOKEN=
BOT_OWNER_ID=
LAVALINK_NODES=name|host|port|password

# Optional Extras
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
GENIUS_ACCESS_TOKEN=
LOG_LEVEL=info
USE_JSON_FALLBACK=true
```

### 4. Launch
```bash
# Build the project
npm run build

# Deploy Slash Commands
npm run deploy

# Start the engine
npm start
```

---

## 🛠️ Commands & Categories

Melora features over **75 unique commands** organized into a clean hierarchy:

- 🎵 **Playback**: play, skip, stop, pause, resume, seek, volume, replay
- 📜 **Queue**: list, shuffle, clear, remove, move, repeat, autoplay
- 💎 **Filters**: bassboost, nightcore, vaporwave, 8d, equalizer, speed, pitch
- 📂 **Playlists**: create, load, save, delete, list, info
- 📊 **Stats**: rank, top, leaderboard, wrapped, daily/weekly whispers
- ⚙️ **Settings**: prefix, 24/7, music-channel, dj-role, language
- 🛠️ **Utility**: ping, uptime, help, info, nodes, invite

---

## 🏗️ Architecture

Built with a focus on modularity and type safety:

- **`src/core/`**: Central event and command dispatching engine.
- **`src/managers/`**: Orchestration layers for Music, Permissions, and State.
- **`src/middleware/`**: Safety layers for Rate Limiting, Cooldowns, and Access Control.
- **`src/structures/`**: Core logic for the player and queue systems.
- **`src/components/`**: Rich Discord UI builders (Containers, Menus, Buttons).

---

## ⚙️ Production Notes

- **Process Management**: Use `pm2` for high availability: `pm2 start dist/index.js --name melora`.
- **Performance**: We recommend hosting Lavalink on the same network as your bot for the lowest possible latency.
- **Scalability**: The database repository pattern allows for easy migration between storage backends.

## 📄 License
Licensed under the [MIT License](LICENSE).
