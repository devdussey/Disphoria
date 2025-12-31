const vanityUses = new Map();

async function detectVanityUse(guild) {
  if (!guild) return { hasVanity: false, used: false, code: null, uses: null };
  const hasVanityFeature = !!guild.vanityURLCode || guild.features?.includes?.('VANITY_URL');
  if (!hasVanityFeature) return { hasVanity: false, used: false, code: null, uses: null };

  const previousUses = vanityUses.get(guild.id);

  try {
    const data = await guild.fetchVanityData();
    const currentUses = typeof data?.uses === 'number' ? data.uses : null;
    const used = typeof previousUses === 'number' && typeof currentUses === 'number'
      ? currentUses > previousUses
      : false;
    if (currentUses !== null) {
      vanityUses.set(guild.id, currentUses);
    }
    return {
      hasVanity: !!(data?.code || guild.vanityURLCode),
      used,
      code: data?.code || guild.vanityURLCode || null,
      uses: currentUses,
    };
  } catch (err) {
    // Best-effort fallback: we still know the guild has or had a vanity code.
    return {
      hasVanity: true,
      used: false,
      code: guild.vanityURLCode || null,
      uses: typeof previousUses === 'number' ? previousUses : null,
      error: err,
    };
  }
}

module.exports = { detectVanityUse };
