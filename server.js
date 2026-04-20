const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const mealRoutes = require('./routes/meals');
const workoutRoutes = require('./routes/workouts');
const checkinRoutes = require('./routes/checkins');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

initDatabase();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'fitness-app-local-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/checkins', checkinRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/meals', (req, res) => res.sendFile(path.join(__dirname, 'public', 'meals.html')));
app.get('/workout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'workout.html')));

const server = app.listen(PORT, () => {
  console.log('\n==========================================');
  console.log('  Fitness App is running!');
  console.log(`  Open your browser at: http://localhost:${PORT}`);
  console.log('==========================================\n');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Start the app on another port, for example:`);
    console.error(`  PowerShell: $env:PORT=${PORT + 1}; node .\\server.js`);
    process.exit(1);
  }

  throw error;
});
