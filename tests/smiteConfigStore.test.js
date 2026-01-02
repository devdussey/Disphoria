const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const modulePath = require.resolve('../src/utils/smiteConfigStore');
const { resetDataDirCache } = require('../src/utils/dataDir');

async function withTempStore(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smite-config-'));
  delete require.cache[modulePath];
  process.env.DISPHORIABOT_DATA_DIR = tmpDir;
  resetDataDirCache();
  const store = require(modulePath);
  try {
    await fn(store, tmpDir);
  } finally {
    delete require.cache[modulePath];
    if (store?.clearCache) store.clearCache();
    resetDataDirCache();
    delete process.env.DISPHORIABOT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('defaults to enabled when no config exists', async () => {
  await withTempStore(async store => {
    const config = store.getConfig('guild');
    assert.equal(config.enabled, true);
    assert.deepEqual(config.immuneRoleIds, []);
    assert.equal(store.isEnabled('guild'), true);
    assert.deepEqual(store.getImmuneRoleIds('guild'), []);
  });
});

test('setEnabled persists preference to disk', async () => {
  await withTempStore(async (store, dir) => {
    const guildId = 'guild';
    const result = await store.setEnabled(guildId, false);
    assert.equal(result.enabled, false);
    assert.equal(store.isEnabled(guildId), false);

    const file = path.join(process.env.DISPHORIABOT_DATA_DIR, 'smite_config.json');
    assert.ok(fs.existsSync(file));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.guilds[guildId].enabled, false);

    // Re-require to ensure persistence
    store.clearCache();
    delete require.cache[modulePath];
    const reloaded = require(modulePath);
    assert.equal(reloaded.isEnabled(guildId), false);
    assert.deepEqual(reloaded.getImmuneRoleIds(guildId), []);
  });
});

test('immune roles can be added, removed, and persisted', async () => {
  await withTempStore(async (store, dir) => {
    const guildId = 'guild';
    await store.addImmuneRole(guildId, '123');
    await store.addImmuneRole(guildId, '456');
    await store.addImmuneRole(guildId, '123'); // dedupe

    let config = store.getConfig(guildId);
    assert.deepEqual(config.immuneRoleIds.sort(), ['123', '456']);

    await store.removeImmuneRole(guildId, '123');
    config = store.getConfig(guildId);
    assert.deepEqual(config.immuneRoleIds, ['456']);

    // Persisted to disk
    const file = path.join(process.env.DISPHORIABOT_DATA_DIR, 'smite_config.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(saved.guilds[guildId].immuneRoleIds, ['456']);
  });
});
