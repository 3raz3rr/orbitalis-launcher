const crypto = require("crypto");

const sessions = new Map();

function createSession(user) {
  const id = crypto.randomBytes(24).toString("hex");
  sessions.set(id, {
    user,
    createdAt: Date.now(),
  });
  return id;
}

function readSession(id) {
  if (!id) return null;
  return sessions.get(id) || null;
}

function deleteSession(id) {
  if (id) sessions.delete(id);
}

module.exports = { createSession, readSession, deleteSession };
