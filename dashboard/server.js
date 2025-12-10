require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-env',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

// Discord OAuth2 Setup
const DISCORD_CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/callback';

passport.use(new DiscordStrategy({
  clientID: DISCORD_CLIENT_ID,
  clientSecret: DISCORD_CLIENT_SECRET,
  callbackURL: CALLBACK_URL,
}, (accessToken, refreshToken, profile, done) => {
  return done(null, { ...profile, accessToken });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// Auth Routes
app.get('/auth/discord', passport.authenticate('discord', {
  scope: ['identify', 'guilds']
}));

app.get('/auth/callback', passport.authenticate('discord', {
  failureRedirect: '/login'
}), (req, res) => {
  res.redirect('/');
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.redirect('/');
  });
});

// API Routes
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    avatar: req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : null,
    authenticated: true
  });
});

// Get user's guilds
app.get('/api/guilds', requireAuth, (req, res) => {
  const guilds = req.user.guilds || [];
  // Filter to only include guilds where user has manage guild permission
  const filtered = guilds.filter(g => (g.permissions & (1 << 5)) === (1 << 5));
  res.json(filtered);
});

// Get guild settings
app.get('/api/guild/:guildId/settings', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const dataPath = path.join(__dirname, '../data');

    // Load all config files
    const configs = {};

    try {
      const logChannels = JSON.parse(await fs.readFile(path.join(dataPath, 'logchanneltypes.json'), 'utf8'));
      configs.logChannels = logChannels[guildId] || {};
    } catch (_) {}

    try {
      const streamLogs = JSON.parse(await fs.readFile(path.join(dataPath, 'streamlogs.json'), 'utf8'));
      configs.streamLogs = streamLogs[guildId] || {};
    } catch (_) {}

    try {
      const autoroles = JSON.parse(await fs.readFile(path.join(dataPath, 'autoroles.json'), 'utf8'));
      configs.autoroles = autoroles[guildId] || [];
    } catch (_) {}

    res.json(configs);
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Update logging config
app.post('/api/guild/:guildId/logging/enable', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { category, enabled } = req.body;

    const dataPath = path.join(__dirname, '../data/streamlogs.json');
    const data = JSON.parse(await fs.readFile(dataPath, 'utf8').catch(() => '{}'));

    if (!data[guildId]) data[guildId] = { categories: {}, categoryChannels: {} };
    if (!data[guildId].categories) data[guildId].categories = {};

    data[guildId].categories[category] = enabled;

    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('Logging update error:', err);
    res.status(500).json({ error: 'Failed to update logging' });
  }
});

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Dashboard] Running on http://localhost:${PORT}`);
  console.log('[Dashboard] Make sure these env vars are set:');
  console.log('  - CLIENT_ID');
  console.log('  - DISCORD_CLIENT_SECRET');
  console.log('  - DISCORD_CALLBACK_URL (optional, defaults to http://localhost:3000/auth/callback)');
});
