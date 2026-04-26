const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fitness-data.json');
let cache;

function defaultData() {
  return {
    counters: {
      users: 0,
      profiles: 0,
      mealPlans: 0,
      workoutPlans: 0,
      workoutProgress: 0,
      mealWeekProgress: 0,
      weeklyCheckins: 0
    },
    users: [],
    user_profiles: [],
    meal_plans: [],
    workout_plans: [],
    workout_progress: [],
    meal_week_progress: [],
    weekly_checkins: []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function loadDb() {
  if (cache) {
    return cache;
  }

  if (!fs.existsSync(DB_PATH)) {
    cache = defaultData();
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
    return cache;
  }

  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    cache = defaultData();
  }

  cache.counters = { ...defaultData().counters, ...(cache.counters || {}) };
  cache.users = cache.users || [];
  cache.user_profiles = cache.user_profiles || [];
  cache.meal_plans = cache.meal_plans || [];
  cache.workout_plans = cache.workout_plans || [];
  cache.workout_progress = cache.workout_progress || [];
  cache.meal_week_progress = cache.meal_week_progress || [];
  cache.weekly_checkins = cache.weekly_checkins || [];

  return cache;
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(loadDb(), null, 2));
}

function nextId(collectionName) {
  const db = loadDb();
  db.counters[collectionName] += 1;
  return db.counters[collectionName];
}

function getDb() {
  return loadDb();
}

function initDatabase() {
  loadDb();
  saveDb();
  console.log('Database ready.');
}

function createUser(username, password) {
  const db = loadDb();
  const normalizedUsername = username.trim();
  const existing = db.users.find(user => user.username.toLowerCase() === normalizedUsername.toLowerCase());
  if (existing) {
    const error = new Error('Username already taken. Try another.');
    error.code = 'DUPLICATE_USER';
    throw error;
  }

  const user = {
    id: nextId('users'),
    username: normalizedUsername,
    password,
    created_at: nowIso()
  };

  db.users.push(user);
  saveDb();
  return user;
}

function findUserByUsername(username) {
  const db = loadDb();
  return db.users.find(user => user.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

function getProfileByUserId(userId) {
  const db = loadDb();
  return db.user_profiles.find(profile => profile.user_id === userId) || null;
}

function saveProfile(userId, data) {
  const db = loadDb();
  const existing = db.user_profiles.find(profile => profile.user_id === userId);

  if (existing) {
    Object.assign(existing, data, { updated_at: nowIso() });
    saveDb();
    return existing;
  }

  const profile = {
    id: nextId('profiles'),
    user_id: userId,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...data
  };

  db.user_profiles.push(profile);
  saveDb();
  return profile;
}

function createMealPlan(userId, weeks, planData, groceryList) {
  const db = loadDb();
  const mealPlan = {
    id: nextId('mealPlans'),
    user_id: userId,
    weeks,
    plan_data: planData,
    grocery_list: groceryList,
    created_at: nowIso()
  };

  db.meal_plans.push(mealPlan);
  saveDb();
  return mealPlan;
}

function getLatestMealPlan(userId) {
  const db = loadDb();
  return db.meal_plans
    .filter(plan => plan.user_id === userId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
}

function getMealPlanHistory(userId) {
  const db = loadDb();
  return db.meal_plans
    .filter(plan => plan.user_id === userId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

function createWorkoutPlan(userId, planData, monthStart) {
  const db = loadDb();
  const workoutPlan = {
    id: nextId('workoutPlans'),
    user_id: userId,
    plan_data: planData,
    month_start: monthStart,
    completed: 0,
    created_at: nowIso()
  };

  db.workout_plans.push(workoutPlan);
  saveDb();
  return workoutPlan;
}

function getLatestWorkoutPlan(userId) {
  const db = loadDb();
  return db.workout_plans
    .filter(plan => plan.user_id === userId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
}

function getWorkoutPlanById(planId) {
  const db = loadDb();
  return db.workout_plans.find(plan => plan.id === planId) || null;
}

function getWorkoutProgress(userId, workoutPlanId) {
  const db = loadDb();
  return db.workout_progress.filter(
    progress => progress.user_id === userId && progress.workout_plan_id === workoutPlanId
  );
}

function findWorkoutProgress(userId, workoutPlanId, week, dayName) {
  const db = loadDb();
  return db.workout_progress.find(
    progress =>
      progress.user_id === userId &&
      progress.workout_plan_id === workoutPlanId &&
      progress.week === week &&
      progress.day_name === dayName
  ) || null;
}

function addWorkoutProgress(userId, workoutPlanId, week, dayName, notes) {
  const db = loadDb();
  const progress = {
    id: nextId('workoutProgress'),
    user_id: userId,
    workout_plan_id: workoutPlanId,
    week,
    day_name: dayName,
    notes,
    completed_at: nowIso()
  };

  db.workout_progress.push(progress);
  saveDb();
  return progress;
}

function countWorkoutProgress(userId, workoutPlanId) {
  return getWorkoutProgress(userId, workoutPlanId).length;
}

function markWorkoutPlanCompleted(planId) {
  const db = loadDb();
  const plan = db.workout_plans.find(item => item.id === planId);
  if (plan) {
    plan.completed = 1;
    saveDb();
  }
  return plan || null;
}

function getMealWeekProgress(userId, mealPlanId) {
  const db = loadDb();
  return db.meal_week_progress.filter(
    progress => progress.user_id === userId && progress.meal_plan_id === mealPlanId
  );
}

function findMealWeekProgress(userId, mealPlanId, week) {
  const db = loadDb();
  return db.meal_week_progress.find(
    progress =>
      progress.user_id === userId &&
      progress.meal_plan_id === mealPlanId &&
      progress.week === week
  ) || null;
}

function addMealWeekProgress(userId, mealPlanId, week, notes) {
  const db = loadDb();
  const progress = {
    id: nextId('mealWeekProgress'),
    user_id: userId,
    meal_plan_id: mealPlanId,
    week,
    notes,
    completed_at: nowIso()
  };

  db.meal_week_progress.push(progress);
  saveDb();
  return progress;
}

function getWeeklyCheckins(userId) {
  const db = loadDb();
  return db.weekly_checkins
    .filter(checkin => checkin.user_id === userId)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

function addWeeklyCheckin(userId, week, mealPlanId, workoutPlanId, payload) {
  const db = loadDb();
  const checkin = {
    id: nextId('weeklyCheckins'),
    user_id: userId,
    week,
    meal_plan_id: mealPlanId,
    workout_plan_id: workoutPlanId,
    payload,
    created_at: nowIso()
  };

  db.weekly_checkins.push(checkin);
  saveDb();
  return checkin;
}

function deleteMealPlan(userId, planId) {
  const db = loadDb();
  const idx = db.meal_plans.findIndex(p => p.id === planId && p.user_id === userId);
  if (idx === -1) return false;
  db.meal_plans.splice(idx, 1);
  db.meal_week_progress = db.meal_week_progress.filter(p => p.meal_plan_id !== planId);
  saveDb();
  return true;
}

function deleteWorkoutPlan(userId, planId) {
  const db = loadDb();
  const idx = db.workout_plans.findIndex(p => p.id === planId && p.user_id === userId);
  if (idx === -1) return false;
  db.workout_plans.splice(idx, 1);
  db.workout_progress = db.workout_progress.filter(p => p.workout_plan_id !== planId);
  saveDb();
  return true;
}

module.exports = {
  getDb,
  initDatabase,
  createUser,
  findUserByUsername,
  getProfileByUserId,
  saveProfile,
  createMealPlan,
  getLatestMealPlan,
  getMealPlanHistory,
  deleteMealPlan,
  createWorkoutPlan,
  getLatestWorkoutPlan,
  getWorkoutPlanById,
  getWorkoutProgress,
  findWorkoutProgress,
  addWorkoutProgress,
  countWorkoutProgress,
  markWorkoutPlanCompleted,
  deleteWorkoutPlan,
  getMealWeekProgress,
  findMealWeekProgress,
  addMealWeekProgress,
  getWeeklyCheckins,
  addWeeklyCheckin
};
