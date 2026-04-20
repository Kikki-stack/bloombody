const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  getProfileByUserId,
  createWorkoutPlan,
  getLatestWorkoutPlan,
  getWorkoutPlanById,
  getWorkoutProgress,
  findWorkoutProgress,
  addWorkoutProgress,
  countWorkoutProgress,
  markWorkoutPlanCompleted
} = require('../database');

const router = express.Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');
const MODEL_NAME = 'gemini-2.5-flash';
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set. AI generation endpoints may fail.');
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonObj = text.match(/\{[\s\S]*\}/);
  if (jsonObj) return jsonObj[0];
  return text;
}

function toInt(value, fallback, min, max) {
  let parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) && typeof value === 'string') {
    const match = value.match(/\d+/);
    parsed = match ? Number.parseInt(match[0], 10) : Number.NaN;
  }

  if (Number.isNaN(parsed)) return fallback;
  if (typeof min === 'number' && parsed < min) return min;
  if (typeof max === 'number' && parsed > max) return max;
  return parsed;
}

function normalizeDayName(dayName) {
  if (!dayName || typeof dayName !== 'string') return null;
  const cleaned = dayName.trim().toLowerCase();
  if (!cleaned) return null;

  const exact = WEEK_DAYS.find(day => day.toLowerCase() === cleaned);
  if (exact) return exact;

  const prefix = cleaned.slice(0, 3);
  return WEEK_DAYS.find(day => day.toLowerCase().startsWith(prefix)) || null;
}

function nextFreeDay(usedDays) {
  return WEEK_DAYS.find(day => !usedDays.has(day)) || null;
}

function normalizeIntensityLevel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'standard';

  if (raw.includes('unmotivated') || raw.includes('easy') || raw.includes('low motivation') || raw.includes('low energy')) {
    return 'unmotivated';
  }

  if (raw.includes('light')) return 'light';
  if (raw.includes('motivat')) return 'motivated';

  if (raw.includes('push') || raw.includes('harder') || raw.includes('challenge') || raw.includes('limit')) {
    return 'push_my_limits';
  }

  return 'standard';
}

function getIntensityProfile(fitnessLevel, intensityLevel = 'standard') {
  const level = (fitnessLevel || 'beginner').toLowerCase();
  const intensity = normalizeIntensityLevel(intensityLevel);

  const profiles = {
    beginner: {
      minDuration: 20,
      maxDuration: 35,
      baseDuration: 24,
      durationWeeklyStep: 2,
      maxExercises: 4,
      minSets: 2,
      maxSets: 3,
      minReps: 8,
      maxReps: 14,
      preferLowImpact: true,
      activeSeconds: 60
    },
    intermediate: {
      minDuration: 28,
      maxDuration: 48,
      baseDuration: 32,
      durationWeeklyStep: 3,
      maxExercises: 5,
      minSets: 2,
      maxSets: 4,
      minReps: 8,
      maxReps: 18,
      preferLowImpact: false,
      activeSeconds: 60
    },
    advanced: {
      minDuration: 36,
      maxDuration: 65,
      baseDuration: 40,
      durationWeeklyStep: 4,
      maxExercises: 6,
      minSets: 3,
      maxSets: 5,
      minReps: 8,
      maxReps: 24,
      preferLowImpact: false,
      activeSeconds: 60
    }
  };

  const profile = { ...(profiles[level] || profiles.beginner) };

  if (intensity === 'unmotivated') {
    profile.maxDuration = Math.max(profile.minDuration + 6, profile.maxDuration - 8);
    profile.baseDuration = Math.max(profile.minDuration, profile.baseDuration - 5);
    profile.maxExercises = Math.max(3, profile.maxExercises - 1);
    profile.maxSets = Math.max(profile.minSets, profile.maxSets - 1);
    profile.maxReps = Math.max(profile.minReps + 2, profile.maxReps - 4);
    profile.preferLowImpact = true;
    profile.activeSeconds = 20;
  }

  if (intensity === 'light') {
    profile.maxDuration = Math.max(profile.minDuration + 8, profile.maxDuration - 5);
    profile.baseDuration = Math.max(profile.minDuration, profile.baseDuration - 3);
    profile.maxExercises = Math.max(3, profile.maxExercises - 1);
    profile.maxSets = Math.max(profile.minSets, profile.maxSets - 1);
    profile.activeSeconds = 30;
  }

  if (intensity === 'standard') {
    profile.activeSeconds = 40;
  }

  if (intensity === 'motivated') {
    profile.maxDuration += 3;
    profile.baseDuration += 2;
    profile.maxExercises += 1;
    profile.activeSeconds = 50;
  }

  if (intensity === 'push_my_limits') {
    profile.maxDuration += 5;
    profile.baseDuration += 3;
    profile.maxExercises += 1;
    profile.maxSets += 1;
    profile.maxReps += 2;
    profile.activeSeconds = 60;
  }

  return profile;
}

function getLowImpactFallback(index) {
  const library = [
    { name: 'March in Place', muscle_group: 'Cardio', reps: 12 },
    { name: 'Chair Squats', muscle_group: 'Legs and Glutes', reps: 10 },
    { name: 'Wall Push-Ups', muscle_group: 'Chest and Triceps', reps: 10 },
    { name: 'Glute Bridge', muscle_group: 'Glutes and Hamstrings', reps: 12 },
    { name: 'Bird-Dog', muscle_group: 'Core and Lower Back', reps: 10 },
    { name: 'Seated Band Row', muscle_group: 'Back and Shoulders', reps: 12 }
  ];

  return library[index % library.length];
}

function isHighImpactExercise(name) {
  const text = (name || '').toLowerCase();
  return /jump|burpee|sprint|plyometric|high knees|box jump|mountain climber/.test(text);
}

function sanitizeExercise(rawExercise, index, intensity) {
  let sourceExercise = rawExercise;
  if (intensity.preferLowImpact && isHighImpactExercise(rawExercise?.name)) {
    sourceExercise = getLowImpactFallback(index);
  }

  const name = rawExercise?.name && String(rawExercise.name).trim()
    ? String(sourceExercise.name).trim()
    : `Exercise ${index + 1}`;

  const fallbackReps = Math.min(intensity.maxReps, Math.max(intensity.minReps, 10));

  return {
    name,
    muscle_group: sourceExercise?.muscle_group || 'Full Body',
    sets: toInt(sourceExercise?.sets, Math.min(3, intensity.maxSets), intensity.minSets, intensity.maxSets),
    reps: toInt(sourceExercise?.reps, fallbackReps, intensity.minReps, intensity.maxReps),
    active_seconds: intensity.activeSeconds || 60,
    rest_between_reps_seconds: 15,
    rest_between_sets_seconds: 30,
    description: sourceExercise?.description || 'Perform the movement with controlled form and steady breathing.',
    easier: sourceExercise?.easier || 'Reduce range of motion and slow the pace.',
    harder: sourceExercise?.harder || 'Add tempo control or an extra set if your form remains solid.'
  };
}

function fallbackWorkout(day, weekIndex, focusText, intensity) {
  const exerciseTemplates = [
    { name: 'Chair Squats', muscle_group: 'Legs and Glutes', reps: 10 },
    { name: 'Wall or Incline Push-Ups', muscle_group: 'Chest and Triceps', reps: 8 },
    { name: 'Bird-Dog', muscle_group: 'Core and Lower Back', reps: 10 },
    { name: 'Band Rows or Towel Rows', muscle_group: 'Back and Shoulders', reps: 10 }
  ];

  const durationTarget = intensity.baseDuration + (weekIndex * intensity.durationWeeklyStep);

  return {
    day,
    type: `${focusText || 'Full Body'} Session`,
    muscle_groups: ['full body', 'core'],
    duration_minutes: toInt(durationTarget, intensity.baseDuration, intensity.minDuration, intensity.maxDuration),
    exercises: exerciseTemplates
      .slice(0, intensity.maxExercises)
      .map((exercise, idx) => sanitizeExercise(exercise, idx, intensity))
  };
}

function normalizeWeek(rawWeek, targetWorkoutDays, weekIndex, intensity) {
  const focusText = rawWeek?.focus || 'Progressive Training';
  const usedDays = new Set();
  const workouts = [];
  const incomingWorkouts = Array.isArray(rawWeek?.workouts) ? rawWeek.workouts : [];

  for (const workout of incomingWorkouts) {
    if (workouts.length >= targetWorkoutDays) break;

    let day = normalizeDayName(workout?.day);
    if (!day || usedDays.has(day)) {
      day = nextFreeDay(usedDays);
    }
    if (!day) break;

    const exercisesRaw = Array.isArray(workout?.exercises) ? workout.exercises : [];
    const limitedExercisesRaw = exercisesRaw.slice(0, intensity.maxExercises);
    const sanitizedExercises = limitedExercisesRaw.length
      ? limitedExercisesRaw.map((exercise, idx) => sanitizeExercise(exercise, idx, intensity))
      : fallbackWorkout(day, weekIndex, focusText, intensity).exercises;

    const defaultDuration = intensity.baseDuration + (weekIndex * intensity.durationWeeklyStep);

    workouts.push({
      day,
      type: workout?.type || `${focusText} Workout`,
      muscle_groups: Array.isArray(workout?.muscle_groups) && workout.muscle_groups.length
        ? workout.muscle_groups.map(item => String(item))
        : ['full body'],
      duration_minutes: toInt(workout?.duration_minutes, defaultDuration, intensity.minDuration, intensity.maxDuration),
      exercises: sanitizedExercises
    });
    usedDays.add(day);
  }

  while (workouts.length < targetWorkoutDays) {
    const day = nextFreeDay(usedDays);
    if (!day) break;
    workouts.push(fallbackWorkout(day, weekIndex, focusText, intensity));
    usedDays.add(day);
  }

  workouts.sort((left, right) => WEEK_DAYS.indexOf(left.day) - WEEK_DAYS.indexOf(right.day));

  return {
    week: toInt(rawWeek?.week, weekIndex + 1, 1, 4),
    focus: focusText,
    description: rawWeek?.description || 'Progressive weekly workouts with clear structure and rest days.',
    workouts,
    rest_days: WEEK_DAYS.filter(day => !usedDays.has(day))
  };
}

function normalizeWorkoutPlan(rawPlan, targetWorkoutDays, context = {}) {
  const targetDays = toInt(targetWorkoutDays, 3, 2, 6);
  const incomingWeeks = Array.isArray(rawPlan?.weeks) ? rawPlan.weeks : [];
  const intensityLevel = normalizeIntensityLevel(context.intensityLevel || rawPlan?.intensity_level || 'standard');
  const intensity = getIntensityProfile(context.fitnessLevel, intensityLevel);
  const weeks = [];

  for (let i = 0; i < 4; i++) {
    weeks.push(normalizeWeek(incomingWeeks[i] || {}, targetDays, i, intensity));
  }

  return {
    plan_name: rawPlan?.plan_name || '4-Week Personalized Workout Plan',
    overview: rawPlan?.overview || 'A structured month of workouts tailored to your level, equipment, and recovery needs.',
    intensity_level: intensityLevel,
    weeks
  };
}

async function generateJsonFromPrompt(prompt) {
  const modelConfigs = [
    {
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 1024 }
      }
    },
    {
      model: MODEL_NAME,
      generationConfig: { responseMimeType: 'application/json' }
    }
  ];

  let lastError;

  for (const config of modelConfigs) {
    try {
      const model = genAI.getGenerativeModel(config);
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = extractJSON(text);
      return JSON.parse(jsonStr);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

function buildWorkoutPrompt(profile, extra = {}) {
  const fitnessLevel = profile?.fitness_level || 'beginner';
  const daysPerWeek = profile?.days_per_week || 3;
  const equipment = profile?.equipment || 'none (bodyweight only)';
  const bodyPains = profile?.body_pains || 'none';
  const goal = profile?.goal || 'weight loss and general fitness';
  const targetMuscleGroups = Array.isArray(profile?.target_muscle_groups)
    ? profile.target_muscle_groups
    : [];
  const profileTargetFocus = targetMuscleGroups.length ? targetMuscleGroups.join(', ') : 'balanced full body';
  const focusMuscle = extra.focus_muscle || profileTargetFocus;
  const extraNotes = extra.extra_notes || 'none';
  const intensityLevel = normalizeIntensityLevel(extra.intensity_level || profile?.intensity_level || 'standard');
  const intensity = getIntensityProfile(fitnessLevel, intensityLevel);

  return `You are a certified personal trainer. Create a complete 4-week workout plan.

PERSON DETAILS:
- Fitness level: ${fitnessLevel}
- Goal: ${goal}
- Workout days per week: ${daysPerWeek}
- Available equipment: ${equipment}
- Body pains / injuries to avoid: ${bodyPains}
- Profile target muscle groups: ${profileTargetFocus}
- Priority muscle group this month: ${focusMuscle}
- Additional notes: ${extraNotes}
- Motivation/Intensity level: ${intensityLevel}

STRICT RULES:
- NEVER include exercises that stress injured / painful areas.
- Exercises must match the available equipment exactly.
- Match intensity to fitness level.
- Timer format per exercise: 1 minute active → 15 seconds rest between reps → 30 seconds rest between sets.
- Include easier and harder modifications for every exercise.
- Provide exactly ${daysPerWeek} workout days per week (remaining days are rest days).
- Week 1 should be slightly easier than week 4 (progressive overload).
- Every workout day must be on a unique real weekday name (Monday..Sunday).
- Every exercise must have integer values for sets and reps. Never output undefined/null reps.
- Session length should stay in this range: ${intensity.minDuration}-${intensity.maxDuration} minutes.
- Max exercises per workout: ${intensity.maxExercises}.
- Sets per exercise should be between ${intensity.minSets} and ${intensity.maxSets}.
- Reps per exercise should be between ${intensity.minReps} and ${intensity.maxReps}.
- Active timer per exercise interval must be ${intensity.activeSeconds} seconds.
- For beginner or low-motivation plans, keep workouts gentle, low-impact, and confidence-building.
- Avoid punishing HIIT-style structures for beginners. Focus on consistency and adherence.

Return ONLY valid JSON. No explanation, no markdown, raw JSON exactly matching this structure:
{
  "plan_name": "4-Week Beginner Fat Burn Plan",
  "overview": "A progressive plan focusing on full body fat burning with bodyweight exercises, building strength and endurance over 4 weeks.",
  "weeks": [
    {
      "week": 1,
      "focus": "Foundation & Form",
      "description": "Getting your body used to movement patterns. Focus on correct form over speed.",
      "workouts": [
        {
          "day": "Monday",
          "type": "Full Body",
          "muscle_groups": ["chest", "legs", "core"],
          "duration_minutes": 40,
          "exercises": [
            {
              "name": "Jumping Jacks",
              "muscle_group": "Full Body, Cardio",
              "sets": 3,
              "reps": 20,
              "active_seconds": 60,
              "rest_between_reps_seconds": 15,
              "rest_between_sets_seconds": 30,
              "description": "Stand upright, jump while spreading legs shoulder-width apart and raising arms overhead simultaneously. Return to start. Keep a steady rhythm.",
              "easier": "Step side to side instead of jumping - step jacks",
              "harder": "Add a squat at the bottom of each jack"
            },
            {
              "name": "Push-Ups",
              "muscle_group": "Chest, Triceps, Shoulders",
              "sets": 3,
              "reps": 10,
              "active_seconds": 60,
              "rest_between_reps_seconds": 15,
              "rest_between_sets_seconds": 30,
              "description": "Start in plank position with hands shoulder-width apart. Lower your chest to the floor keeping elbows at 45 degrees. Push back up. Keep core tight throughout.",
              "easier": "Perform push-ups on your knees",
              "harder": "Slow the descent to 3 seconds then explode up"
            }
          ]
        },
        {
          "day": "Wednesday",
          "type": "Lower Body & Core",
          "muscle_groups": ["glutes", "quads", "hamstrings", "core"],
          "duration_minutes": 35,
          "exercises": [
            {
              "name": "Bodyweight Squats",
              "muscle_group": "Quads, Glutes, Hamstrings",
              "sets": 3,
              "reps": 15,
              "active_seconds": 60,
              "rest_between_reps_seconds": 15,
              "rest_between_sets_seconds": 30,
              "description": "Stand with feet shoulder-width apart, toes slightly out. Push hips back and bend knees, lowering until thighs are parallel to floor. Drive through heels to stand.",
              "easier": "Squat to a chair or lower surface",
              "harder": "Add a jump at the top - jump squats"
            }
          ]
        }
      ],
      "rest_days": ["Tuesday", "Thursday", "Saturday", "Sunday"]
    }
  ]
}

Generate all 4 weeks with progressive difficulty. Make workouts varied and engaging. Include exactly ${daysPerWeek} workout days per week.`;
}

router.post('/generate', requireAuth, async (req, res) => {
  const profile = getProfileByUserId(req.session.userId);
  const { focus_muscle, extra_notes } = req.body;
  const targetWorkoutDays = profile?.days_per_week || 3;
  const intensityLevel = normalizeIntensityLevel(profile?.intensity_level || 'standard');
  const profileTargets = Array.isArray(profile?.target_muscle_groups)
    ? profile.target_muscle_groups
    : [];
  const effectiveFocus = focus_muscle || (profileTargets.length ? profileTargets.join(', ') : 'balanced full body');

  const prompt = buildWorkoutPrompt(profile, {
    focus_muscle: effectiveFocus,
    extra_notes,
    intensity_level: intensityLevel
  });

  try {
    const rawPlanData = await generateJsonFromPrompt(prompt);
    const planData = normalizeWorkoutPlan(rawPlanData, targetWorkoutDays, {
      fitnessLevel: profile?.fitness_level,
      intensityLevel
    });

    const monthStart = new Date().toISOString().split('T')[0];
    const workoutPlan = createWorkoutPlan(req.session.userId, planData, monthStart);

    res.json({ id: workoutPlan.id, ...planData, created_at: workoutPlan.created_at });
  } catch (err) {
    console.error('Workout generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate workout plan. The AI service returned an invalid response or is temporarily unavailable.' });
  }
});

router.get('/current', requireAuth, (req, res) => {
  const plan = getLatestWorkoutPlan(req.session.userId);
  if (!plan) return res.json(null);

  const profile = getProfileByUserId(req.session.userId);
  const normalizedPlan = normalizeWorkoutPlan(plan.plan_data, profile?.days_per_week || 3, {
    fitnessLevel: profile?.fitness_level,
    intensityLevel: profile?.intensity_level || plan.plan_data?.intensity_level
  });
  const progress = getWorkoutProgress(req.session.userId, plan.id);

  res.json({
    id: plan.id,
    ...normalizedPlan,
    month_start: plan.month_start,
    completed: plan.completed,
    progress,
    created_at: plan.created_at
  });
});

router.post('/complete-workout', requireAuth, (req, res) => {
  const { workout_plan_id, week, day_name, notes } = req.body;

  const existing = findWorkoutProgress(req.session.userId, workout_plan_id, week, day_name);

  if (!existing) {
    addWorkoutProgress(req.session.userId, workout_plan_id, week, day_name, notes || '');
  }

  // Check if plan is fully complete
  const plan = getWorkoutPlanById(workout_plan_id);
  if (plan) {
    const profile = getProfileByUserId(req.session.userId);
    const planData = normalizeWorkoutPlan(plan.plan_data, profile?.days_per_week || 3, {
      fitnessLevel: profile?.fitness_level,
      intensityLevel: profile?.intensity_level || plan.plan_data?.intensity_level
    });
    let totalWorkouts = 0;
    planData.weeks.forEach(w => { totalWorkouts += (w.workouts || []).length; });
    const doneCount = countWorkoutProgress(req.session.userId, workout_plan_id);
    if (doneCount >= totalWorkouts) {
      markWorkoutPlanCompleted(workout_plan_id);
    }
  }

  res.json({ success: true });
});

router.post('/checkup', requireAuth, async (req, res) => {
  const { feedback, new_focus, change_difficulty } = req.body;
  const profile = getProfileByUserId(req.session.userId);
  const currentPlan = getLatestWorkoutPlan(req.session.userId);

  if (!currentPlan) return res.status(400).json({ error: 'No existing workout plan found.' });

  const resolvedIntensityLevel = normalizeIntensityLevel(change_difficulty || profile?.intensity_level || currentPlan?.plan_data?.intensity_level || 'standard');

  const oldPlan = currentPlan.plan_data;
  const checkupPrompt = `You are a personal trainer doing a monthly progress checkup.

PREVIOUS PLAN: ${oldPlan.plan_name}
USER FEEDBACK: ${feedback || 'No specific feedback provided'}
NEW PRIORITY MUSCLE GROUP: ${new_focus || 'same as before'}
INTENSITY LEVEL FOR NEXT PLAN: ${resolvedIntensityLevel}
FITNESS LEVEL: ${profile?.fitness_level || 'beginner'}
BODY PAINS: ${profile?.body_pains || 'none'}
EQUIPMENT: ${profile?.equipment || 'bodyweight only'}
DAYS PER WEEK: ${profile?.days_per_week || 3}

Based on this feedback, create a NEW improved 4-week plan. Progress from what was done before. Address the feedback. Adjust difficulty as requested.

For beginner and low-motivation users, keep plans shorter and easier so they stay consistent and do not burn out.

Return ONLY valid JSON with exactly the same structure as before (plan_name, overview, weeks array with workouts and rest_days).`;

  try {
    const rawPlanData = await generateJsonFromPrompt(checkupPrompt);
    const planData = normalizeWorkoutPlan(rawPlanData, profile?.days_per_week || 3, {
      fitnessLevel: profile?.fitness_level,
      intensityLevel: resolvedIntensityLevel
    });

    const monthStart = new Date().toISOString().split('T')[0];
    const workoutPlan = createWorkoutPlan(req.session.userId, planData, monthStart);

    res.json({ id: workoutPlan.id, ...planData, created_at: workoutPlan.created_at });
  } catch (err) {
    console.error('Checkup error:', err.message);
    res.status(500).json({ error: 'Failed to generate updated plan. Please try again.' });
  }
});

module.exports = router;
