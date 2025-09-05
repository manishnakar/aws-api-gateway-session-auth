import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import AWS from 'aws-sdk';

const app = express();
app.use(express.json());
app.use(cookieParser());

// configure AWS SDK for DynamoDB (if running on EC2/Lambda with role, this picks it up)
const REGION = process.env.AWS_REGION || 'us-east-1';
AWS.config.update({ region: REGION });
const dynamo = new AWS.DynamoDB.DocumentClient();

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'sessions';
const INACTIVITY_SECONDS = parseInt(process.env.INACTIVITY_SECONDS || '1800', 10); // 30 mins default
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';

// --- Demo users (replace with your user store)
const demoUsers = [
  { userId: 'user-1', username: 'alice', passwordHash: bcrypt.hashSync('password123', 8) },
  { userId: 'user-2', username: 'bob', passwordHash: bcrypt.hashSync('secret', 8) }
];

// helper: create session
async function createSession(userId) {
  const sessionId = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + INACTIVITY_SECONDS;
  const item = {
    sessionId,
    userId,
    createdAt: now,
    lastActivity: now,
    expiresAt
  };
  await dynamo.put({ TableName: SESSIONS_TABLE, Item: item }).promise();
  return item;
}

// helper: delete session
async function deleteSession(sessionId) {
  await dynamo.delete({ TableName: SESSIONS_TABLE, Key: { sessionId } }).promise();
}

// POST /auth/login
// Accepts JSON { username, password }. On success sets HttpOnly cookie and returns user info.
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });

  const user = demoUsers.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const session = await createSession(user.userId);

  // set HttpOnly cookie (recommended). If your frontend is on different domain, set SameSite=None and Secure, and use credentials:'include'
  res.cookie(SESSION_COOKIE_NAME, session.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // set to 'none' if cross-site and using https
    maxAge: INACTIVITY_SECONDS * 1000
  });

  res.json({ userId: user.userId, username: user.username });
});

// POST /auth/logout
app.post('/auth/logout', async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE_NAME] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (sessionId) {
    await deleteSession(sessionId);
    res.clearCookie(SESSION_COOKIE_NAME);
  }
  res.json({ ok: true });
});

// An unprotected health endpoint
app.get('/health', (req, res) => res.json({ ok: true }));

// Protected example route: note that API Gateway's authorizer will usually prevent unauthorized requests.
// But we keep a fallback check here for defense-in-depth.
app.get('/api/profile', async (req, res) => {
  // get token from cookie or Authorization header
  const sessionId = req.cookies[SESSION_COOKIE_NAME] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!sessionId) return res.status(401).json({ error: 'unauthenticated' });

  // look up session
  const r = await dynamo.get({ TableName: SESSIONS_TABLE, Key: { sessionId } }).promise();
  if (!r.Item) return res.status(401).json({ error: 'invalid session' });

  // optional: check expiry locally (authorizer already does it)
  const now = Math.floor(Date.now() / 1000);
  if (r.Item.lastActivity + INACTIVITY_SECONDS < now) {
    await deleteSession(sessionId);
    return res.status(401).json({ error: 'session expired' });
  }

  // you may refresh lastActivity here, or rely on authorizer to have done so
  await dynamo.update({
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
    UpdateExpression: 'SET lastActivity = :now, expiresAt = :expires',
    ExpressionAttributeValues: {
      ':now': now,
      ':expires': now + INACTIVITY_SECONDS
    }
  }).promise();

  // fetch user info — using demoUsers here
  const user = demoUsers.find(u => u.userId === r.Item.userId);
  res.json({ userId: user.userId, username: user.username, lastActivity: r.Item.lastActivity });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
