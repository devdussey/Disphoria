function splitOwnerList(value) {
  if (!value) return [];
  return value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

function parseOwnerIds() {
  const idsFromList = splitOwnerList(process.env.BOT_OWNER_IDS);
  if (idsFromList.length) return idsFromList;
  return splitOwnerList(process.env.BOT_OWNER_ID);
}

function isOwner(userId) {
  return parseOwnerIds().includes(String(userId));
}

module.exports = { parseOwnerIds, isOwner };
