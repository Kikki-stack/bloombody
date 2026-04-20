const express = require('express');
const { getProfileByUserId, saveProfile } = require('../database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

router.get('/', requireAuth, (req, res) => {
  const profile = getProfileByUserId(req.session.userId);
  if (!profile) return res.json(null);
  res.json({
    ...profile,
    dietary_restrictions: Array.isArray(profile.dietary_restrictions)
      ? profile.dietary_restrictions
      : JSON.parse(profile.dietary_restrictions || '[]')
  });
});

router.post('/', requireAuth, (req, res) => {
  const {
    age, weight, weight_unit, height, height_unit, gender, goal,
    dietary_restrictions, allergies, halal, body_pains, fitness_level,
    target_muscle_groups, intensity_level, days_per_week, equipment, calorie_goal, cuisine_preferences, measurement_unit
  } = req.body;

  const data = {
    age: age || null,
    weight: weight || null,
    weight_unit: weight_unit || 'kg',
    height: height || null,
    height_unit: height_unit || 'cm',
    gender: gender || '',
    goal: goal || 'weight loss',
    dietary_restrictions: dietary_restrictions || [],
    allergies: allergies || '',
    halal: halal ? 1 : 0,
    body_pains: body_pains || '',
    target_muscle_groups: Array.isArray(target_muscle_groups) ? target_muscle_groups : [],
    fitness_level: fitness_level || 'beginner',
    intensity_level: intensity_level || 'standard',
    days_per_week: days_per_week || 3,
    equipment: equipment || 'none',
    calorie_goal: calorie_goal || 2000,
    cuisine_preferences: cuisine_preferences || '',
    measurement_unit: measurement_unit === 'cups' ? 'cups' : 'grams'
  };

  saveProfile(req.session.userId, data);

  res.json({ success: true });
});

module.exports = router;
