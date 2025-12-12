let currentUser = null;
let currentGuild = null;
let currentPage = 'dashboard';

const COMMANDS = [
  { name: 'help', description: 'Show available commands' },
  { name: 'logconfig', description: 'Create or sync dedicated log channels' },
  { name: 'ban', description: 'Ban a user' },
  { name: 'kick', description: 'Kick a user' },
  { name: 'mute', description: 'Mute a user' },
  { name: 'warn', description: 'Warn a user' },
  { name: 'removebg', description: 'Remove background from image' },
  { name: 'embed', description: 'Create custom embed' },
  { name: 'say', description: 'Make bot say something' },
  { name: 'serverinfo', description: 'Get server information' },
  { name: 'userinfo', description: 'Get user information' },
  { name: 'avatar', description: 'Get user avatar' },
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    if (response.ok) {
      currentUser = await response.json();
      loadGuilds();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <h1>DisphoriaBot Dashboard</h1>
        <p>Manage your Discord bot settings</p>
        <a class="btn btn-primary" href="/auth/discord" style="text-decoration: none; display: inline-block;">
          Login with Discord
        </a>
      </div>
    </div>
  `;
}

async function loadGuilds() {
  try {
    const response = await fetch('/api/guilds');
    const guilds = await response.json();

    if (guilds.length === 0) {
      showError('You have no servers where you can manage the bot.');
      return;
    }

    currentGuild = guilds[0].id;
    renderDashboard(guilds);
  } catch (err) {
    console.error('Error loading guilds:', err);
    showError('Failed to load your servers.');
  }
}

function renderDashboard(guilds) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <nav>
      <div class="container">
        <div class="logo">🤖 DisphoriaBot</div>
        <div class="nav-right">
          <div class="user-info">
            ${currentUser.avatar ? `<img src="${currentUser.avatar}" class="user-avatar">` : '<div class="user-avatar"></div>'}
            <span>${currentUser.username}</span>
          </div>
          <a href="/auth/logout" class="btn btn-danger">Logout</a>
        </div>
      </div>
    </nav>

    <div class="container">
      <div class="dashboard">
        <div class="sidebar">
          <h3>Navigation</h3>
          <div class="sidebar-nav">
            <button class="nav-btn active" onclick="switchPage('dashboard')">Dashboard</button>
            <button class="nav-btn" onclick="switchPage('logging')">Logging</button>
            <button class="nav-btn" onclick="switchPage('commands')">Commands</button>
            <button class="nav-btn" onclick="switchPage('stats')">Statistics</button>
          </div>
        </div>

        <div class="content">
          <div class="guild-selector">
            <label for="guild-select">Select Server:</label>
            <select id="guild-select" onchange="changeGuild(this.value)">
              ${guilds.map(g => `<option value="${g.id}" ${g.id === currentGuild ? 'selected' : ''}>${g.name}</option>`).join('')}
            </select>
          </div>

          <div id="page-content"></div>
        </div>
      </div>
    </div>
  `;

  // Add event listeners
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  switchPage('dashboard');
}

function switchPage(page) {
  currentPage = page;
  const content = document.getElementById('page-content');

  switch (page) {
    case 'dashboard':
      showDashboard(content);
      break;
    case 'logging':
      showLogging(content);
      break;
    case 'commands':
      showCommands(content);
      break;
    case 'stats':
      showStats(content);
      break;
  }
}

function showDashboard(container) {
  container.innerHTML = `
    <h2>Dashboard</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="number">79</div>
        <div class="label">Commands</div>
      </div>
      <div class="stat-card">
        <div class="number">22</div>
        <div class="label">Log Types</div>
      </div>
      <div class="stat-card">
        <div class="number">10</div>
        <div class="label">Stream Categories</div>
      </div>
    </div>

    <div class="section">
      <h3>Quick Actions</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
        <button class="btn btn-primary" onclick="switchPage('logging')">Configure Logging</button>
        <button class="btn btn-primary" onclick="switchPage('commands')">View Commands</button>
        <button class="btn btn-primary" onclick="openDocumentation()">Documentation</button>
      </div>
    </div>

    <div class="section">
      <h3>Recent Activity</h3>
      <p style="color: var(--light); font-size: 14px;">No recent activity to display.</p>
    </div>
  `;
}

async function showLogging(container) {
  container.innerHTML = '<h2>Logging Configuration</h2><div class="loading">Loading...</div>';

  try {
    const settings = await fetch(`/api/guild/${currentGuild}/settings`).then(r => r.json());
    const streamLogs = settings.streamLogs || {};

    const categories = [
      { id: 'bot', name: 'Bot', icon: '🤖' },
      { id: 'messages', name: 'Messages', icon: '💬' },
      { id: 'invites', name: 'Invites', icon: '🔗' },
      { id: 'reactions', name: 'Reactions', icon: '😊' },
      { id: 'roles', name: 'Roles', icon: '🏷️' },
      { id: 'users', name: 'Members', icon: '👥' },
      { id: 'server', name: 'Server', icon: '🏰' },
      { id: 'channels', name: 'Channels', icon: '📺' },
      { id: 'verification', name: 'Verification', icon: '✅' },
      { id: 'security', name: 'Security', icon: '🔒' },
    ];

    let html = '<h2>Stream Log Categories</h2>';

    categories.forEach(cat => {
      const enabled = streamLogs.categories?.[cat.id] || false;
      html += `
        <div class="setting-item">
          <label>
            <span>${cat.icon} ${cat.name}</span>
          </label>
          <button class="toggle ${enabled ? 'active' : ''}" onclick="toggleLogging('${cat.id}', ${!enabled})"></button>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="error">Failed to load logging settings.</div>`;
  }
}

async function toggleLogging(category, enabled) {
  try {
    const response = await fetch(`/api/guild/${currentGuild}/logging/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, enabled })
    });

    if (response.ok) {
      showLogging(document.getElementById('page-content'));
    } else {
      alert('Failed to update logging setting.');
    }
  } catch (err) {
    alert('Error updating logging setting.');
  }
}

function showCommands(container) {
  container.innerHTML = `
    <h2>Commands</h2>
    <p style="margin-bottom: 20px; color: var(--light);">Total: ${COMMANDS.length} commands available</p>
    <div class="commands-grid">
      ${COMMANDS.map(cmd => `
        <div class="command-card">
          <h4>/${cmd.name}</h4>
          <p>${cmd.description}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function showStats(container) {
  container.innerHTML = `
    <h2>Statistics</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="number">79</div>
        <div class="label">Total Commands</div>
      </div>
      <div class="stat-card">
        <div class="number">9</div>
        <div class="label">Event Log Types</div>
      </div>
      <div class="stat-card">
        <div class="number">10</div>
        <div class="label">Stream Categories</div>
      </div>
      <div class="stat-card">
        <div class="number">∞</div>
        <div class="label">Uptime</div>
      </div>
    </div>
  `;
}

function changeGuild(guildId) {
  currentGuild = guildId;
  switchPage(currentPage);
}

function openDocumentation() {
  alert('Documentation coming soon!');
}

function showError(message) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="container">
      <div class="error" style="margin-top: 20px;">${message}</div>
    </div>
  `;
}
