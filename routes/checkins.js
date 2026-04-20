const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  getProfileByUserId,
  getLatestMealPlan,
  getLatestWorkoutPlan,
  getMealWeekProgress,
  getWorkoutProgress,
  addWeeklyCheckin,
  getWeeklyCheckins
} = require('../database');

const router = express.Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');
const MODEL_NAME = 'gemini-2.5-flash';

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

function getWeekWorkouts(plan, weekNum) {
  const weeks = Array.isArray(plan?.plan_data?.weeks) ? plan.plan_data.weeks : [];
  const byNumber = weeks.find(week => Number(week?.week) === weekNum);
  const fallbackByIndex = weeks[weekNum - 1];
  const targetWeek = byNumber || fallbackByIndex;
  const workouts = Array.isArray(targetWeek?.workouts) ? targetWeek.workouts : [];
  return workouts;
}

function getWeeklyCompletionStatus(userId, weekNum) {
  const mealPlan = getLatestMealPlan(userId);
  const workoutPlan = getLatestWorkoutPlan(userId);

  if (!mealPlan || !workoutPlan) {
    return {
      week: weekNum,
      meal_plan_found: !!mealPlan,
      workout_plan_found: !!workoutPlan,
      meal_week_completed: false,
      workout_week_completed: false,
      eligible: false,
      message: 'Generate both meal and workout plans first.'
    };
  }

  const mealWeekProgress = getMealWeekProgress(userId, mealPlan.id);
  const mealWeekCompleted = mealWeekProgress.some(progress => Number(progress.week) === weekNum);

  const workoutsForWeek = getWeekWorkouts(workoutPlan, weekNum);
  const workoutProgress = getWorkoutProgress(userId, workoutPlan.id);
  const workoutDoneCount = workoutProgress.filter(item => Number(item.week) === weekNum).length;
  const workoutWeekCompleted = workoutsForWeek.length > 0 && workoutDoneCount >= workoutsForWeek.length;

  const eligible = mealWeekCompleted && workoutWeekCompleted;
  let message = 'Ready for weekly check-in.';

  if (!mealWeekCompleted && !workoutWeekCompleted) {
    message = `Complete week ${weekNum} in both Meal Planner and Workout Planner first.`;
  } else if (!mealWeekCompleted) {
    message = `Mark week ${weekNum} as complete in Meal Planner first.`;
  } else if (!workoutWeekCompleted) {
    message = `Finish all workouts in week ${weekNum} first.`;
  }

  return {
    week: weekNum,
    meal_plan_found: true,
    workout_plan_found: true,
    meal_plan_id: mealPlan.id,
    workout_plan_id: workoutPlan.id,
    meal_week_completed: mealWeekCompleted,
    workout_week_completed: workoutWeekCompleted,
    workouts_done: workoutDoneCount,
    workouts_total: workoutsForWeek.length,
    eligible,
    message
  };
}

router.get('/weekly-status', requireAuth, (req, res) => {
  const week = Math.max(1, parseInt(req.query.week, 10) || 1);
  const status = getWeeklyCompletionStatus(req.session.userId, week);
  res.json(status);
});

router.post('/weekly-review', requireAuth, async (req, res) => {
  const week = Math.max(1, parseInt(req.body.week, 10) || 1);
  const workoutFeedback = String(req.body.workout_feedback || '').trim();
  const mealFeedback = String(req.body.meal_feedback || '').trim();

  const status = getWeeklyCompletionStatus(req.session.userId, week);
  if (!status.eligible) {
    return res.status(400).json({ error: status.message, status });
  }

  const profile = getProfileByUserId(req.session.userId);
  const prompt = `You are a fitness and nutrition coach doing a weekly check-in.

Week completed: ${week}
Fitness level: ${profile?.fitness_level || 'beginner'}
Motivation/intensity level: ${profile?.intensity_level || 'standard'}
Goal: ${profile?.goal || 'weight loss and health'}
Dietary restrictions: ${profile?.dietary_restrictions || 'none'}
Body pains or injuries: ${profile?.body_pains || 'none'}
Workout feedback: ${workoutFeedback || 'No workout feedback provided'}
Meal feedback: ${mealFeedback || 'No meal feedback provided'}

Return only JSON with this exact structure:
{
  "summary": "short weekly summary",
  "changes_needed": true,
  "workout_changes": ["specific workout change"],
  "meal_changes": ["specific meal change"],
  "motivation_tip": "single practical tip",
  "next_week_focus": "what to focus on next week"
}

Rules:
- Keep all advice realistic for weight loss adherence.
- If user seems tired, stressed, or inconsistent, recommend easier/simpler changes.
- Do not suggest unsafe or extreme diet/training methods.`;

  try {
    const review = await generateJsonFromPrompt(prompt);

    addWeeklyCheckin(req.session.userId, week, status.meal_plan_id, status.workout_plan_id, {
      workout_feedback: workoutFeedback,
      meal_feedback: mealFeedback,
      review
    });

    res.json({ success: true, review, status });
  } catch (err) {
    console.error('Weekly check-in error:', err.message);
    res.status(500).json({ error: 'Failed to generate weekly check-in review. Please try again.' });
  }
});

router.get('/history', requireAuth, (req, res) => {
  const items = getWeeklyCheckins(req.session.userId);
  res.json(items);
});

module.exports = router;
