const express = require('express');
const bcrypt = require('bcryptjs');
const { createUser, findUserByUsername } = require('../database');

const router = express.Router();
const REGISTRATION_LOCKED = true;

router.post('/register', async (req, res) => {
  if (REGISTRATION_LOCKED) {
    return res.status(403).json({ error: 'New account creation is temporarily disabled.' });
  }

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (password.length < 1) return res.status(400).json({ error: 'Password cannot be empty.' });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = createUser(username, hashed);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username, userId: user.id });
  } catch (err) {
    if (err.code === 'DUPLICATE_USER') return res.status(400).json({ error: 'Username already taken. Try another.' });
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  try {
    const user = findUserByUsername(username.trim());
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password.' });

    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username, userId: user.id });
  } catch (err) {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ userId: req.session.userId, username: req.session.username });
});

module.exports = router;
