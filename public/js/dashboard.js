// Dashboard page logic

let currentUser = null;
let profileData = null;

async function init() {
  // Auth check
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/'; return; }
  currentUser = await res.json();

  // Set sidebar
  document.getElementById('sidebarAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
  document.getElementById('sidebarUsername').textContent = currentUser.username;
  document.getElementById('welcomeTitle').textContent = `Welcome back, ${currentUser.username}! 👋`;

  // Load profile
  await loadProfile();
  await loadStats();
}

async function loadProfile() {
  const res = await fetch('/api/profile');
  if (!res.ok) return;
  profileData = await res.json();

  if (!profileData) {
    document.getElementById('profileSetupBanner').style.display = 'block';
    document.getElementById('profileCard').style.display = 'none';
  } else {
    document.getElementById('profileSetupBanner').style.display = 'none';
    document.getElementById('profileCard').style.display = 'block';
    renderProfileDisplay();
    populateProfileForm();
  }

  // Update stat cards
  document.getElementById('statCalories').textContent = profileData?.calorie_goal ? `${profileData.calorie_goal} kcal` : 'Not set';
  const levelMap = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
  document.getElementById('statLevel').textContent = profileData?.fitness_level ? levelMap[profileData.fitness_level] : 'Not set';
}

async function loadStats() {
  // Meal plans count
  try {
    const mRes = await fetch('/api/meals/history');
    if (mRes.ok) {
      const plans = await mRes.json();
      document.getElementById('statMealPlans').textContent = plans.length;
    }
  } catch {}

  // Workout completions
  try {
    const wRes = await fetch('/api/workouts/current');
    if (wRes.ok) {
      const plan = await wRes.json();
      if (plan && plan.progress) {
        document.getElementById('statWorkouts').textContent = plan.progress.length;
      } else {
        document.getElementById('statWorkouts').textContent = '0';
      }
    }
  } catch {}
}

function renderProfileDisplay() {
  if (!profileData) return;
  const d = profileData;
  const restrictions = Array.isArray(d.dietary_restrictions) ? d.dietary_restrictions : JSON.parse(d.dietary_restrictions || '[]');
  const targetMuscles = Array.isArray(d.target_muscle_groups) ? d.target_muscle_groups : JSON.parse(d.target_muscle_groups || '[]');
  const intensityMap = {
    unmotivated: 'Unmotivated',
    light: 'Light',
    standard: 'Standard',
    motivated: 'Motivated',
    push_my_limits: 'Push my limits'
  };
  const activityMap = {
    sedentary: 'Sedentary',
    lightly_active: 'Lightly active',
    moderately_active: 'Moderately active',
    active: 'Active',
    very_active: 'Very active'
  };

  document.getElementById('profileDisplay').innerHTML = `
    <div>
      <div style="margin-bottom:12px;"><span style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Personal</span></div>
      <div style="display:grid; gap:8px;">
        ${profileItem('Age', d.age ? d.age + ' years' : '—')}
        ${profileItem('Gender', d.gender || '—')}
        ${profileItem('Weight', d.weight ? `${d.weight} ${d.weight_unit}` : '—')}
        ${profileItem('Height', d.height ? `${d.height} ${d.height_unit}` : '—')}
        ${profileItem('Goal', d.goal || '—')}
        ${profileItem('Calorie Goal', d.calorie_goal ? `${d.calorie_goal} kcal/day` : '—')}
      </div>
    </div>
    <div>
      <div style="margin-bottom:12px;"><span style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Fitness & Diet</span></div>
      <div style="display:grid; gap:8px;">
        ${profileItem('Fitness Level', d.fitness_level || '—')}
        ${profileItem('Intensity Level', intensityMap[d.intensity_level] || d.intensity_level || '—')}
        ${profileItem('Activity Level', activityMap[d.activity_level] || d.activity_level || '—')}
        ${profileItem('Days/Week', d.days_per_week ? d.days_per_week + ' days' : '—')}
        ${profileItem('Equipment', d.equipment || '—')}
        ${profileItem('Target Muscles', targetMuscles.length ? targetMuscles.join(', ') : '—')}
        ${profileItem('Halal', d.halal ? '✅ Yes' : '❌ No')}
        ${profileItem('Meal Units', d.measurement_unit === 'cups' ? 'Cups / tbsp / tsp' : 'Grams / ml')}
        ${profileItem('Restrictions', restrictions.length ? restrictions.join(', ') : 'None')}
        ${profileItem('Allergies', d.allergies || 'None')}
        ${d.body_pains ? profileItem('Body Pains', d.body_pains) : ''}
      </div>
    </div>
  `;
}

function profileItem(label, value) {
  return `<div style="font-size:13px;"><span style="color:var(--text-muted); font-weight:600;">${label}:</span> <span style="color:var(--text-primary);">${value}</span></div>`;
}

function populateProfileForm() {
  if (!profileData) return;
  const d = profileData;
  const restrictions = Array.isArray(d.dietary_restrictions) ? d.dietary_restrictions : JSON.parse(d.dietary_restrictions || '[]');
  const targetMuscles = Array.isArray(d.target_muscle_groups) ? d.target_muscle_groups : JSON.parse(d.target_muscle_groups || '[]');

  if (d.age) document.getElementById('pAge').value = d.age;
  if (d.gender) document.getElementById('pGender').value = d.gender;
  if (d.weight) document.getElementById('pWeight').value = d.weight;
  if (d.weight_unit) document.getElementById('pWeightUnit').value = d.weight_unit;
  if (d.height) document.getElementById('pHeight').value = d.height;
  if (d.height_unit) document.getElementById('pHeightUnit').value = d.height_unit;
  if (d.goal) document.getElementById('pGoal').value = d.goal;
  if (d.calorie_goal) document.getElementById('pCalories').value = d.calorie_goal;
  if (d.halal) document.getElementById('pHalal').checked = true;
  if (d.allergies) document.getElementById('pAllergies').value = d.allergies;
  if (d.cuisine_preferences) document.getElementById('pCuisine').value = d.cuisine_preferences;
  if (d.measurement_unit) document.getElementById('pMeasurementUnit').value = d.measurement_unit;
  if (d.fitness_level) document.getElementById('pFitnessLevel').value = d.fitness_level;
  if (d.intensity_level) document.getElementById('pIntensityLevel').value = d.intensity_level;
  if (d.activity_level) document.getElementById('pActivityLevel').value = d.activity_level;
  if (d.days_per_week) document.getElementById('pDays').value = d.days_per_week;
  if (d.equipment) document.getElementById('pEquipment').value = d.equipment;
  if (d.body_pains) document.getElementById('pBodyPains').value = d.body_pains;

  document.querySelectorAll('.diet-check').forEach(cb => {
    cb.checked = restrictions.includes(cb.value);
  });

  document.querySelectorAll('.target-muscle-check').forEach(cb => {
    cb.checked = targetMuscles.includes(cb.value);
  });
}

function showProfileForm() {
  document.getElementById('profileSetupBanner').style.display = 'none';
  document.getElementById('profileCard').style.display = 'none';
  document.getElementById('profileFormCard').style.display = 'block';
  document.getElementById('profileFormCard').scrollIntoView({ behavior: 'smooth' });
}

function hideProfileForm() {
  document.getElementById('profileFormCard').style.display = 'none';
  if (profileData) {
    document.getElementById('profileCard').style.display = 'block';
  } else {
    document.getElementById('profileSetupBanner').style.display = 'block';
  }
}

function calculateCalories() {
  const age = parseInt(document.getElementById('pAge').value);
  const weight = parseFloat(document.getElementById('pWeight').value);
  const weightUnit = document.getElementById('pWeightUnit').value;
  const height = parseFloat(document.getElementById('pHeight').value);
  const heightUnit = document.getElementById('pHeightUnit').value;
  const gender = document.getElementById('pGender').value;
  const goalType = document.getElementById('pGoal').value;
  const activityLevel = document.getElementById('pActivityLevel').value;
  const intensityLevel = document.getElementById('pIntensityLevel').value;
  const fitnessLevel = document.getElementById('pFitnessLevel').value;
  const days = parseInt(document.getElementById('pDays').value) || 3;

  if (!age || !weight || !height || !gender) {
    showMsg('profileError', 'Please fill in age, weight, height, and gender to auto-calculate.');
    return;
  }

  // Convert to metric
  const weightKg = weightUnit === 'lbs' ? weight * 0.453592 : weight;
  const heightCm = heightUnit === 'ft' ? height * 30.48 : height;

  // Mifflin-St Jeor
  let bmr;
  if (gender === 'male') bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  else bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  // Baseline movement outside workouts
  const activityFactorMap = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    active: 1.725,
    very_active: 1.9
  };
  const activityFactor = activityFactorMap[activityLevel] || 1.2;

  // Workout burn estimate from planned schedule + intensity
  const burnPerWorkoutByIntensity = {
    unmotivated: 120,
    light: 180,
    standard: 250,
    motivated: 320,
    push_my_limits: 400
  };
  const fitnessBurnMultiplier = {
    beginner: 0.9,
    intermediate: 1.0,
    advanced: 1.1
  };

  const workoutBurnPerSession = (burnPerWorkoutByIntensity[intensityLevel] || 250) * (fitnessBurnMultiplier[fitnessLevel] || 1);
  const weeklyWorkoutBurn = Math.round(workoutBurnPerSession * days);
  const dailyWorkoutBurn = weeklyWorkoutBurn / 7;

  const maintenanceBase = bmr * activityFactor;
  const maintenanceWithTraining = maintenanceBase + dailyWorkoutBurn;

  let targetCalories = maintenanceWithTraining;
  if ((goalType || '').includes('weight loss')) {
    const requestedDeficit = goalType.includes('muscle building') ? 250 : 400;
    const safeDeficitCap = Math.round(maintenanceWithTraining * 0.18);
    const deficit = Math.min(requestedDeficit, safeDeficitCap);
    targetCalories = maintenanceWithTraining - deficit;
  }

  const minByGender = gender === 'male' ? 1500 : gender === 'female' ? 1300 : 1400;
  const finalTarget = Math.max(minByGender, Math.min(5000, Math.round(targetCalories)));

  document.getElementById('pCalories').value = finalTarget;
  showMsg(
    'profileSuccess',
    `Calculated! BMR: ~${Math.round(bmr)} kcal/day, base maintenance: ~${Math.round(maintenanceBase)} kcal/day, estimated workout burn: ~${weeklyWorkoutBurn} kcal/week. Suggested daily target: ${finalTarget} kcal/day.`
  );
}

function showMsg(id, msg) {
  const errIds = ['profileError'];
  const sucIds = ['profileSuccess'];
  if (errIds.includes(id)) {
    document.getElementById('profileError').classList.remove('show');
    document.getElementById('profileSuccess').classList.remove('show');
  }
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

async function saveProfile(buttonEl) {
  document.getElementById('profileError').classList.remove('show');
  document.getElementById('profileSuccess').classList.remove('show');

  const restrictions = [];
  document.querySelectorAll('.diet-check:checked').forEach(cb => restrictions.push(cb.value));
  const targetMuscles = [];
  document.querySelectorAll('.target-muscle-check:checked').forEach(cb => targetMuscles.push(cb.value));

  const data = {
    age: parseInt(document.getElementById('pAge').value) || null,
    weight: parseFloat(document.getElementById('pWeight').value) || null,
    weight_unit: document.getElementById('pWeightUnit').value,
    height: parseFloat(document.getElementById('pHeight').value) || null,
    height_unit: document.getElementById('pHeightUnit').value,
    gender: document.getElementById('pGender').value,
    goal: document.getElementById('pGoal').value,
    dietary_restrictions: restrictions,
    allergies: document.getElementById('pAllergies').value.trim(),
    halal: document.getElementById('pHalal').checked,
    body_pains: document.getElementById('pBodyPains').value.trim(),
    target_muscle_groups: targetMuscles,
    fitness_level: document.getElementById('pFitnessLevel').value,
    intensity_level: document.getElementById('pIntensityLevel').value,
    activity_level: document.getElementById('pActivityLevel').value,
    days_per_week: parseInt(document.getElementById('pDays').value),
    equipment: document.getElementById('pEquipment').value,
    calorie_goal: parseInt(document.getElementById('pCalories').value) || 2000,
    cuisine_preferences: document.getElementById('pCuisine').value.trim(),
    measurement_unit: document.getElementById('pMeasurementUnit').value
  };

  const btn = buttonEl || document.querySelector('#profileFormCard .btn.btn-primary.btn-lg');
  if (!btn) {
    showMsg('profileError', 'Could not find save button. Please refresh and try again.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('Failed to save profile');

    profileData = { ...data };
    showMsg('profileSuccess', '✅ Profile saved successfully!');
    setTimeout(() => {
      hideProfileForm();
      renderProfileDisplay();
      loadStats();
    }, 1200);
  } catch (err) {
    showMsg('profileError', 'Failed to save. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Profile';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Start
init();
