# DisphoriaBot Dashboard

A web-based dashboard for managing your Discord bot settings.

## Features

- **Discord OAuth2 Login** - Secure authentication with Discord
- **Server Selection** - Switch between servers you manage
- **Logging Configuration** - Enable/disable stream log categories
- **Command Reference** - View all available bot commands
- **Statistics** - See bot statistics and configuration info
- **Quick Actions** - Fast access to common settings

## Setup

### 1. Get Discord OAuth2 Credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to **OAuth2** → **General**
4. Copy **Client ID** and **Client Secret**

### 2. Set Redirect URI

In Developer Portal → OAuth2 → Redirects, add:
```
http://localhost:3000/auth/callback
```

(For production, change `localhost:3000` to your actual domain)

### 3. Configure Environment Variables

Add to your `.env`:
```env
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_CALLBACK_URL=http://localhost:3000/auth/callback
DASHBOARD_PORT=3000
SESSION_SECRET=your-random-secret-key-here
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start Dashboard

```bash
npm run dashboard
```

Dashboard will be available at: `http://localhost:3000`

## Pages

### Dashboard
- Overview statistics
- Quick action buttons
- Recent activity feed

### Logging
- Enable/disable stream log categories:
  - 🤖 Bot
  - 💬 Messages
  - 🔗 Invites
  - 😊 Reactions
  - 🏷️ Roles
  - 👥 Members
  - 🏰 Server
  - 📺 Channels
  - ✅ Verification
  - 🔒 Security

### Commands
- View all 79 available commands
- Quick reference descriptions

### Statistics
- Total commands
- Log types
- Stream categories
- Uptime info

## Architecture

```
dashboard/
├── server.js          # Express server & API routes
├── public/
│   ├── index.html     # Main HTML
│   ├── app.js         # Frontend app (vanilla JS)
│   └── styles.css     # Dashboard styles
└── README.md
```

## API Endpoints

- `GET /api/user` - Get current user
- `GET /api/guilds` - Get user's manageable servers
- `GET /api/guild/:guildId/settings` - Get guild settings
- `POST /api/guild/:guildId/logging/enable` - Enable/disable stream logs

## Styling

The dashboard uses a Discord-inspired color scheme:
- **Primary**: `#5865f2` (Discord Blue)
- **Success**: `#57f287` (Discord Green)
- **Danger**: `#ed4245` (Discord Red)

## Future Enhancements

- [ ] Guild event logs viewer
- [ ] Role management interface
- [ ] Channel configuration
- [ ] Welcome message customization
- [ ] Auto-moderation settings
- [ ] Premium feature management

## Troubleshooting

**"Login with Discord" button not working:**
- Check `CLIENT_ID` is set in `.env`
- Verify redirect URI matches in Developer Portal

**Getting 401 Unauthorized:**
- Check `DISCORD_CLIENT_SECRET` is correct
- Verify `DISCORD_CALLBACK_URL` matches Developer Portal

**Settings not saving:**
- Check `data/` folder exists and is writable
- Ensure bot has file write permissions

## License

MIT
