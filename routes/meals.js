const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  getProfileByUserId,
  createMealPlan,
  getLatestMealPlan,
  getMealPlanHistory,
  getMealWeekProgress,
  findMealWeekProgress,
  addMealWeekProgress
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

router.post('/generate', requireAuth, async (req, res) => {
  const profile = getProfileByUserId(req.session.userId);
  const { weeks = 1, extra_preferences = '', measurement_unit } = req.body;
  const weeksNum = Math.min(Math.max(parseInt(weeks) || 1, 1), 2);

  const restrictions = profile ? (Array.isArray(profile.dietary_restrictions) ? profile.dietary_restrictions : JSON.parse(profile.dietary_restrictions || '[]')) : [];
  const halal = profile?.halal ? 'YES - strictly Halal, no pork, no alcohol in any ingredient' : 'No';
  const calories = profile?.calorie_goal || 2000;
  const allergies = profile?.allergies || 'None';
  const cuisine = profile?.cuisine_preferences || 'varied international';
  const goal = profile?.goal || 'weight loss';
  const weight = profile?.weight ? `${profile.weight}${profile.weight_unit || 'kg'}` : 'not specified';
  const gender = profile?.gender || 'not specified';
  const age = profile?.age || 'not specified';
  const requestedMeasurementUnit = measurement_unit === 'cups' ? 'cups' : measurement_unit === 'grams' ? 'grams' : null;
  const measurementUnit = requestedMeasurementUnit || (profile?.measurement_unit === 'cups' ? 'cups' : 'grams');

  const prompt = `You are a professional nutritionist creating a personalised meal plan for weight loss.

PERSON DETAILS:
- Age: ${age}, Gender: ${gender}, Weight: ${weight}
- Goal: ${goal}
- Daily calorie target: ${calories} kcal
- Dietary restrictions: ${restrictions.length ? restrictions.join(', ') : 'None'}
- Halal requirement: ${halal}
- Allergies: ${allergies}
- Cuisine preferences: ${cuisine}
- Additional preferences: ${extra_preferences || 'None'}
- Ingredient measurement preference: ${measurementUnit}

STRICT RULES:
- If Halal=YES, every single ingredient must be halal-certified. No pork, no alcohol, no gelatine.
- Respect ALL dietary restrictions and allergies completely.
- Each day: breakfast, lunch, dinner, and 1 snack.
- Include 2 healthier craving alternatives per week.
- All calorie values must be realistic and accurate.
- Instructions must be clear and beginner-friendly.
- If measurement preference is grams: ingredients must mostly use grams (g), milliliters (ml), and piece counts.
- If measurement preference is cups: ingredients must mostly use cups, tablespoons (tbsp), teaspoons (tsp), and piece counts.

Return ONLY a valid JSON object. No explanation, no markdown, just raw JSON exactly matching this structure:
{
  "weeks": [
    {
      "week": 1,
      "total_week_kcal": 12600,
      "days": [
        {
          "day": "Monday",
          "total_kcal": 1800,
          "meals": {
            "breakfast": {
              "name": "Oat Porridge with Banana",
              "description": "Creamy oats topped with fresh banana slices",
              "ingredients": ["1 cup rolled oats", "2 cups water or milk", "1 banana sliced", "1 tsp honey"],
              "instructions": "1. Bring water to boil in a pot. 2. Add oats and stir. 3. Cook for 5 minutes on medium heat stirring occasionally. 4. Pour into bowl, top with banana and drizzle honey.",
              "kcal": 380,
              "protein_g": 12,
              "carbs_g": 68,
              "fat_g": 6
            },
            "lunch": {
              "name": "Grilled Chicken Salad",
              "description": "Fresh salad with grilled chicken breast",
              "ingredients": ["150g chicken breast", "2 cups mixed greens", "1 tomato", "1 cucumber", "2 tbsp olive oil", "lemon juice"],
              "instructions": "1. Season chicken with salt, pepper, and cumin. 2. Grill for 6-7 minutes each side. 3. Slice and place over greens. 4. Drizzle with olive oil and lemon juice.",
              "kcal": 420,
              "protein_g": 38,
              "carbs_g": 12,
              "fat_g": 22
            },
            "dinner": {
              "name": "Salmon with Roasted Vegetables",
              "description": "Oven-baked salmon fillet with colorful roasted vegetables",
              "ingredients": ["200g salmon fillet", "1 cup broccoli florets", "1 bell pepper", "2 tbsp olive oil", "garlic powder", "paprika", "salt"],
              "instructions": "1. Preheat oven to 200C. 2. Toss vegetables in olive oil and spices. 3. Place salmon and vegetables on baking tray. 4. Bake for 18-20 minutes until salmon flakes easily.",
              "kcal": 520,
              "protein_g": 42,
              "carbs_g": 18,
              "fat_g": 28
            },
            "snack": {
              "name": "Apple with Almond Butter",
              "description": "Crisp apple slices with natural almond butter",
              "ingredients": ["1 medium apple", "2 tbsp almond butter"],
              "instructions": "Slice apple and serve with almond butter for dipping.",
              "kcal": 220,
              "protein_g": 5,
              "carbs_g": 28,
              "fat_g": 11
            }
          }
        }
      ],
      "craving_alternatives": [
        {
          "craving": "Chocolate",
          "healthier_option": "Date and cocoa energy balls",
          "ingredients": ["10 medjool dates pitted", "3 tbsp cocoa powder", "1 cup rolled oats", "pinch of salt"],
          "instructions": "1. Blend dates until smooth paste. 2. Mix in cocoa powder, oats, and salt. 3. Roll into small balls. 4. Refrigerate 30 minutes before eating.",
          "kcal": 90
        },
        {
          "craving": "Chips / Crisps",
          "healthier_option": "Baked chickpeas",
          "ingredients": ["1 can chickpeas drained", "1 tbsp olive oil", "1 tsp paprika", "1 tsp cumin", "salt to taste"],
          "instructions": "1. Preheat oven to 200C. 2. Pat chickpeas dry. 3. Toss with oil and spices. 4. Spread on baking tray. 5. Bake 25-30 minutes until crispy, shaking halfway.",
          "kcal": 120
        }
      ]
    }
  ],
  "grocery_list": {
    "produce": ["2 bananas", "4 apples", "500g spinach", "2 cucumbers", "4 tomatoes", "1 head broccoli", "2 bell peppers"],
    "proteins": ["500g chicken breast", "4 salmon fillets (200g each)", "1 can chickpeas", "12 eggs"],
    "grains": ["1kg rolled oats", "500g brown rice", "1 loaf wholegrain bread"],
    "dairy_alternatives": ["1L oat milk or almond milk"],
    "pantry": ["olive oil", "honey", "almond butter", "cocoa powder", "medjool dates"],
    "spices": ["cumin", "paprika", "garlic powder", "cinnamon", "salt", "black pepper"],
    "other": []
  }
}

Generate all ${weeksNum} week(s) with all 7 days each. Make meals varied and interesting. Do not repeat the exact same meals across days.`;

  try {
    const planData = await generateJsonFromPrompt(prompt);

    const mealPlan = createMealPlan(
      req.session.userId,
      weeksNum,
      planData.weeks,
      planData.grocery_list
    );

    res.json({
      id: mealPlan.id,
      weeks: planData.weeks,
      grocery_list: planData.grocery_list,
      measurement_unit: measurementUnit,
      created_at: mealPlan.created_at
    });
  } catch (err) {
    console.error('Meal generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate meal plan. The AI service returned an invalid response or is temporarily unavailable.' });
  }
});

router.get('/current', requireAuth, (req, res) => {
  const plan = getLatestMealPlan(req.session.userId);
  if (!plan) return res.json(null);

  const progress = getMealWeekProgress(req.session.userId, plan.id);
  res.json({
    id: plan.id,
    weeks: plan.plan_data,
    grocery_list: plan.grocery_list,
    progress,
    created_at: plan.created_at
  });
});

router.post('/complete-week', requireAuth, (req, res) => {
  const { meal_plan_id, week, notes } = req.body;
  const weekNum = parseInt(week, 10);
  const mealPlanId = parseInt(meal_plan_id, 10);

  if (Number.isNaN(mealPlanId) || Number.isNaN(weekNum)) {
    return res.status(400).json({ error: 'meal_plan_id and week are required.' });
  }

  const planOwnedByUser = getMealPlanHistory(req.session.userId).some(plan => plan.id === mealPlanId);
  if (!planOwnedByUser) {
    return res.status(404).json({ error: 'Meal plan not found.' });
  }

  const existing = findMealWeekProgress(req.session.userId, mealPlanId, weekNum);
  if (!existing) {
    addMealWeekProgress(req.session.userId, mealPlanId, weekNum, notes || '');
  }

  res.json({ success: true });
});

router.get('/history', requireAuth, (req, res) => {
  const plans = getMealPlanHistory(req.session.userId).map(plan => ({
    id: plan.id,
    weeks: plan.weeks,
    created_at: plan.created_at
  }));
  res.json(plans);
});

module.exports = router;
