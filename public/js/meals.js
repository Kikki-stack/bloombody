// Meal Planner page logic

let currentPlan = null;
let activeWeek = 0;
let activeDay = 0;
let checkedGroceries = {};
let selectedMeasurementUnit = localStorage.getItem('fitlifeMealMeasurementUnit') || 'grams';
let loadingProgressInterval = null;
let loadingTipInterval = null;
let loadingHideTimer = null;

const MEAL_LOADING_TIPS = [
  'Tip: Build meals around protein first to stay full longer.',
  'Tip: Keep your grocery list simple to improve consistency.',
  'Tip: High-volume foods like veggies help weight loss without excess calories.',
  'Tip: Batch-cooking 2-3 meals can make weekday adherence easier.',
  'Tip: Slightly imperfect consistency beats a perfect plan you cannot sustain.'
];

const ML_PER_CUP = 240;
const GRAMS_PER_CUP_DEFAULT = 200;

const INGREDIENT_DENSITY_MAP = [
  { keywords: ['water', 'broth'], gPerCup: 240, liquid: true },
  { keywords: ['milk', 'yogurt'], gPerCup: 245, liquid: true },
  { keywords: ['juice'], gPerCup: 245, liquid: true },
  { keywords: ['olive oil', 'oil'], gPerCup: 216, liquid: true },
  { keywords: ['soy sauce', 'sauce'], gPerCup: 256, liquid: true },
  { keywords: ['honey'], gPerCup: 340, liquid: false },
  { keywords: ['flour'], gPerCup: 120, liquid: false },
  { keywords: ['rolled oats', 'oats'], gPerCup: 90, liquid: false },
  { keywords: ['rice'], gPerCup: 185, liquid: false },
  { keywords: ['quinoa'], gPerCup: 170, liquid: false },
  { keywords: ['spinach'], gPerCup: 30, liquid: false },
  { keywords: ['berries'], gPerCup: 150, liquid: false },
  { keywords: ['chickpeas'], gPerCup: 165, liquid: false },
  { keywords: ['sugar'], gPerCup: 200, liquid: false },
  { keywords: ['butter'], gPerCup: 227, liquid: false }
];

async function init() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/'; return; }
  const user = await res.json();
  document.getElementById('sidebarAvatar').textContent = user.username.charAt(0).toUpperCase();
  document.getElementById('sidebarUsername').textContent = user.username;

  const unitSelect = document.getElementById('mealMeasurementUnit');
  if (unitSelect) unitSelect.value = selectedMeasurementUnit;

  await loadCurrentPlan();
}

function onMeasurementUnitChange() {
  const unitSelect = document.getElementById('mealMeasurementUnit');
  selectedMeasurementUnit = unitSelect?.value === 'cups' ? 'cups' : 'grams';
  localStorage.setItem('fitlifeMealMeasurementUnit', selectedMeasurementUnit);

  if (currentPlan && currentPlan.weeks?.length) {
    renderPlan();
  }
}

async function generateMealPlan() {
  const weeks = document.getElementById('mealWeeks').value;
  const extra = document.getElementById('mealExtraPrefs').value.trim();
  const measurementUnit = document.getElementById('mealMeasurementUnit')?.value === 'cups' ? 'cups' : 'grams';
  selectedMeasurementUnit = measurementUnit;
  localStorage.setItem('fitlifeMealMeasurementUnit', selectedMeasurementUnit);

  showLoading('Generating your personalised meal plan with AI... This takes about 30 seconds.');

  try {
    const res = await fetch('/api/meals/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeks: parseInt(weeks), extra_preferences: extra, measurement_unit: measurementUnit })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');

    currentPlan = { ...data, progress: Array.isArray(data.progress) ? data.progress : [] };
    hideLoading();
    renderPlan();
    showToast('✅ Meal plan generated!', 'success');
  } catch (err) {
    hideLoading();
    showToast('❌ ' + err.message, 'error');
  }
}

async function loadCurrentPlan() {
  try {
    const res = await fetch('/api/meals/current');
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    currentPlan = { ...data, progress: Array.isArray(data.progress) ? data.progress : [] };
    renderPlan();
  } catch {}
}

function renderPlan() {
  if (!currentPlan || !currentPlan.weeks || !currentPlan.weeks.length) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('mealPlanArea').style.display = 'block';

  // Week tabs
  const tabNav = document.getElementById('weekTabNav');
  tabNav.innerHTML = '';
  currentPlan.weeks.forEach((week, i) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${i === activeWeek ? 'active' : ''}`;
    btn.textContent = `Week ${week.week}`;
    btn.onclick = () => { activeWeek = i; activeDay = 0; renderWeek(); updateWeekTabs(); };
    tabNav.appendChild(btn);
  });

  // Add grocery list tab
  const groceryBtn = document.createElement('button');
  groceryBtn.className = 'tab-btn';
  groceryBtn.id = 'groceryTab';
  groceryBtn.textContent = '🛒 Grocery List';
  groceryBtn.onclick = () => { renderGroceryList(); updateWeekTabs(true); };
  tabNav.appendChild(groceryBtn);

  renderWeek();
}

function updateWeekTabs(groceryActive = false) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    if (btn.id === 'groceryTab') {
      btn.classList.toggle('active', groceryActive);
    } else {
      btn.classList.toggle('active', !groceryActive && i === activeWeek);
    }
  });
}

function renderWeek() {
  const week = currentPlan.weeks[activeWeek];
  if (!week) return;

  const days = week.days || [];
  const content = document.getElementById('weekContent');
  content.innerHTML = '';

  const weekHeader = document.createElement('div');
  weekHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;';
  const isWeekDone = isMealWeekMarkedDone(week.week);
  weekHeader.innerHTML = `
    <div style="font-size:15px; font-weight:700; color:var(--text-primary);">Week ${week.week} Meals</div>
    <button class="btn btn-secondary btn-sm" ${isWeekDone ? 'disabled' : ''} onclick="markMealWeekComplete(${week.week})">
      ${isWeekDone ? '✅ Week marked complete' : '✅ Mark week complete'}
    </button>
  `;
  content.appendChild(weekHeader);

  // Day stats summary
  const summaryEl = document.createElement('div');
  summaryEl.style.marginBottom = '20px';

  // Day selector
  const daySelector = document.createElement('div');
  daySelector.className = 'day-selector';
  days.forEach((day, i) => {
    const btn = document.createElement('button');
    btn.className = `day-btn ${i === activeDay ? 'active' : ''}`;
    btn.textContent = day.day.slice(0, 3);
    btn.onclick = () => { activeDay = i; renderDay(week, i); updateDayBtns(); };
    daySelector.appendChild(btn);
  });
  content.appendChild(daySelector);

  const dayContent = document.createElement('div');
  dayContent.id = 'dayContent';
  content.appendChild(dayContent);

  renderDay(week, activeDay);

  // Craving alternatives
  if (week.craving_alternatives && week.craving_alternatives.length) {
    const cravTitle = document.createElement('div');
    cravTitle.style.cssText = 'font-size:16px; font-weight:700; margin-top:28px; margin-bottom:14px; color:var(--text-primary);';
    cravTitle.textContent = '🍫 Healthier Craving Alternatives This Week';
    content.appendChild(cravTitle);

    week.craving_alternatives.forEach(c => {
      const card = document.createElement('div');
      card.className = 'craving-card fade-in';
      card.innerHTML = `
        <div class="craving-title">Instead of "${c.craving}"</div>
        <div class="craving-name">${c.healthier_option} <span class="badge badge-amber" style="margin-left:8px;">${c.kcal} kcal</span></div>
        <div style="margin-top:10px;">
          <button class="collapsible-btn" onclick="toggleCollapsible(this)">
            Ingredients & Instructions <span>▼</span>
          </button>
          <div class="collapsible-content">
            ${c.ingredients ? `<ul>${c.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
            ${c.instructions ? `<p style="margin-top:8px;">${c.instructions}</p>` : ''}
          </div>
        </div>
      `;
      content.appendChild(card);
    });
  }
}

function isMealWeekMarkedDone(weekNum) {
  const progress = Array.isArray(currentPlan?.progress) ? currentPlan.progress : [];
  return progress.some(item => Number(item.week) === Number(weekNum));
}

async function markMealWeekComplete(weekNum) {
  if (!currentPlan?.id) {
    showToast('No active meal plan found.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/meals/complete-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meal_plan_id: currentPlan.id,
        week: weekNum,
        notes: 'Marked complete from meal planner page'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to mark meal week complete');

    if (!Array.isArray(currentPlan.progress)) currentPlan.progress = [];
    if (!currentPlan.progress.some(item => Number(item.week) === Number(weekNum))) {
      currentPlan.progress.push({ week: weekNum });
    }

    showToast('✅ Meal week marked complete! You can now run weekly check-in after workouts are done.', 'success');
    renderWeek();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

function updateDayBtns() {
  document.querySelectorAll('.day-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === activeDay);
  });
}

function renderDay(week, dayIndex) {
  const day = week.days[dayIndex];
  if (!day) return;

  const dayContent = document.getElementById('dayContent');
  dayContent.innerHTML = '';

  // Day summary
  const summary = document.createElement('div');
  summary.className = 'day-summary fade-in';

  const totalKcal = day.total_kcal || calculateDayKcal(day.meals);
  const totalProtein = calculateMacro(day.meals, 'protein_g');
  const totalCarbs = calculateMacro(day.meals, 'carbs_g');
  const totalFat = calculateMacro(day.meals, 'fat_g');

  summary.innerHTML = `
    <div class="day-kcal-main">
      <div class="value">${totalKcal}</div>
      <div class="label">kcal total</div>
    </div>
    <div style="flex:1; display:grid; gap:10px;">
      <div class="progress-wrap">
        <div class="progress-label"><span>🥩 Protein</span><span>${totalProtein}g</span></div>
        <div class="progress-bar"><div class="progress-fill blue" style="width:${Math.min(100, totalProtein/50*100)}%;"></div></div>
      </div>
      <div class="progress-wrap">
        <div class="progress-label"><span>🌾 Carbs</span><span>${totalCarbs}g</span></div>
        <div class="progress-bar"><div class="progress-fill amber" style="width:${Math.min(100, totalCarbs/250*100)}%;"></div></div>
      </div>
      <div class="progress-wrap">
        <div class="progress-label"><span>🥑 Fat</span><span>${totalFat}g</span></div>
        <div class="progress-bar"><div class="progress-fill green" style="width:${Math.min(100, totalFat/80*100)}%;"></div></div>
      </div>
    </div>
  `;
  dayContent.appendChild(summary);

  // Meal cards
  const grid = document.createElement('div');
  grid.className = 'meals-grid fade-in';

  const mealTypes = [
    { key: 'breakfast', label: '🌅 Breakfast', color: 'badge-amber' },
    { key: 'lunch', label: '☀️ Lunch', color: 'badge-green' },
    { key: 'dinner', label: '🌙 Dinner', color: 'badge-blue' },
    { key: 'snack', label: '🍎 Snack', color: 'badge-purple' }
  ];

  mealTypes.forEach(({ key, label, color }) => {
    const meal = day.meals?.[key];
    if (!meal) return;

    const card = document.createElement('div');
    card.className = 'meal-card';
    card.innerHTML = `
      <div class="meal-card-header">
        <span class="meal-type-label">${label}</span>
        <span class="badge ${color}">${meal.kcal || 0} kcal</span>
      </div>
      <div class="meal-card-body">
        <div class="meal-name">${meal.name || ''}</div>
        <div class="meal-description">${meal.description || ''}</div>
        <div class="macro-bar">
          <div class="macro-item">
            <span class="macro-value">${meal.protein_g || 0}g</span>
            <span class="macro-label">Protein</span>
          </div>
          <div class="macro-item">
            <span class="macro-value">${meal.carbs_g || 0}g</span>
            <span class="macro-label">Carbs</span>
          </div>
          <div class="macro-item">
            <span class="macro-value">${meal.fat_g || 0}g</span>
            <span class="macro-label">Fat</span>
          </div>
        </div>
        <button class="collapsible-btn" onclick="toggleCollapsible(this)">
          📝 Ingredients <span>▼</span>
        </button>
        <div class="collapsible-content">
          <ul>${(meal.ingredients || []).map(i => `<li>${convertIngredientLine(String(i), selectedMeasurementUnit)}</li>`).join('')}</ul>
        </div>
        <button class="collapsible-btn" onclick="toggleCollapsible(this)">
          👨‍🍳 Instructions <span>▼</span>
        </button>
        <div class="collapsible-content">
          <p>${meal.instructions || 'No instructions provided.'}</p>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  dayContent.appendChild(grid);
}

function renderGroceryList() {
  if (!currentPlan || !currentPlan.grocery_list) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('mealPlanArea').style.display = 'block';

  const content = document.getElementById('weekContent');
  content.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;';
  header.innerHTML = `
    <h2 style="font-size:18px; font-weight:700;">🛒 Grocery List</h2>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-secondary btn-sm" onclick="printGroceryList()">🖨️ Print</button>
      <button class="btn btn-secondary btn-sm" onclick="uncheckAll()">↺ Uncheck All</button>
    </div>
  `;
  content.appendChild(header);

  const note = document.createElement('p');
  note.style.cssText = 'font-size:13px; color:var(--text-muted); margin-bottom:20px;';
  note.textContent = '💡 Tap any item to check it off as you shop.';
  content.appendChild(note);

  const gl = currentPlan.grocery_list;
  const sections = [
    { key: 'produce', label: '🥦 Produce & Vegetables', icon: '🥦' },
    { key: 'proteins', label: '🥩 Proteins & Meat', icon: '🥩' },
    { key: 'grains', label: '🌾 Grains & Bread', icon: '🌾' },
    { key: 'dairy_alternatives', label: '🥛 Dairy & Alternatives', icon: '🥛' },
    { key: 'pantry', label: '🫙 Pantry & Condiments', icon: '🫙' },
    { key: 'spices', label: '🌶️ Spices & Herbs', icon: '🌶️' },
    { key: 'other', label: '📦 Other', icon: '📦' }
  ];

  sections.forEach(({ key, label }) => {
    const items = gl[key];
    if (!items || !items.length) return;

    const section = document.createElement('div');
    section.className = 'grocery-section fade-in';
    section.innerHTML = `<div class="grocery-section-title">${label}</div>`;

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'grocery-items';

    items.forEach((item, idx) => {
      const itemKey = `${key}-${idx}`;
      const isChecked = checkedGroceries[itemKey] || false;
      const el = document.createElement('div');
      el.className = `grocery-item ${isChecked ? 'checked' : ''}`;
      el.dataset.key = itemKey;
      const itemText = convertIngredientLine(String(item), selectedMeasurementUnit);
      el.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleGrocery('${itemKey}', this)"> ${itemText}`;
      el.onclick = (e) => {
        if (e.target.tagName !== 'INPUT') {
          const cb = el.querySelector('input');
          cb.checked = !cb.checked;
          toggleGrocery(itemKey, cb);
        }
      };
      itemsWrap.appendChild(el);
    });

    section.appendChild(itemsWrap);
    content.appendChild(section);
  });
}

function findDensityInfo(text) {
  const line = text.toLowerCase();
  for (const entry of INGREDIENT_DENSITY_MAP) {
    if (entry.keywords.some(k => line.includes(k))) {
      return entry;
    }
  }
  return { gPerCup: GRAMS_PER_CUP_DEFAULT, liquid: false };
}

function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

function parseMixedNumber(numText) {
  const value = String(numText).trim();
  if (!value) return NaN;

  if (value.includes(' ')) {
    const [wholePart, fracPart] = value.split(/\s+/, 2);
    const whole = parseFloat(wholePart);
    const frac = parseMixedNumber(fracPart);
    if (!Number.isNaN(whole) && !Number.isNaN(frac)) return whole + frac;
  }

  if (value.includes('/')) {
    const [num, den] = value.split('/').map(Number);
    if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) return num / den;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function formatRounded(value, digits = 2) {
  return Number(value.toFixed(digits)).toString();
}

function formatCupsSmart(cupsValue) {
  if (cupsValue >= 0.25) {
    return `${formatRounded(roundToStep(cupsValue, 0.25), 2)} cup`;
  }

  const tbsp = cupsValue * 16;
  if (tbsp >= 1) {
    return `${formatRounded(roundToStep(tbsp, 0.5), 2)} tbsp`;
  }

  const tsp = cupsValue * 48;
  return `${formatRounded(roundToStep(tsp, 0.5), 2)} tsp`;
}

function convertToCupsString(source, numericValue, sourceUnit) {
  const info = findDensityInfo(source);
  let cups;

  if (sourceUnit === 'g') cups = numericValue / info.gPerCup;
  else if (sourceUnit === 'ml') cups = numericValue / ML_PER_CUP;
  else return null;

  if (!(cups > 0)) return null;
  return formatCupsSmart(cups);
}

function convertToMetricString(source, cupsValue) {
  const info = findDensityInfo(source);
  if (!(cupsValue > 0)) return null;

  if (info.liquid) {
    const ml = roundToStep(cupsValue * ML_PER_CUP, 5);
    return `${formatRounded(ml, 0)} ml`;
  }

  const grams = roundToStep(cupsValue * info.gPerCup, 5);
  return `${formatRounded(grams, 0)} g`;
}

function convertIngredientLine(line, targetUnit) {
  if (!line || typeof line !== 'string') return line;
  const trimmed = line.trim();
  if (!trimmed) return line;

  if (targetUnit === 'cups') {
    const gMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams)\b/i);
    if (gMatch) {
      const value = parseFloat(gMatch[1]);
      const converted = convertToCupsString(trimmed, value, 'g');
      if (converted) return trimmed.replace(gMatch[0], converted);
    }

    const mlMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
    if (mlMatch) {
      const value = parseFloat(mlMatch[1]);
      const converted = convertToCupsString(trimmed, value, 'ml');
      if (converted) return trimmed.replace(mlMatch[0], converted);
    }

    return trimmed;
  }

  const cupMatch = trimmed.match(/(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*cups?\b/i);
  if (cupMatch) {
    const cups = parseMixedNumber(cupMatch[1]);
    if (!Number.isNaN(cups)) {
      const converted = convertToMetricString(trimmed, cups);
      if (converted) return trimmed.replace(cupMatch[0], converted);
    }
  }

  const tbspMatch = trimmed.match(/(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(tbsp|tablespoons?)\b/i);
  if (tbspMatch) {
    const tbsp = parseMixedNumber(tbspMatch[1]);
    if (!Number.isNaN(tbsp)) {
      const cups = tbsp / 16;
      const converted = convertToMetricString(trimmed, cups);
      if (converted) return trimmed.replace(tbspMatch[0], converted);
    }
  }

  const tspMatch = trimmed.match(/(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(tsp|teaspoons?)\b/i);
  if (tspMatch) {
    const tsp = parseMixedNumber(tspMatch[1]);
    if (!Number.isNaN(tsp)) {
      const cups = tsp / 48;
      const converted = convertToMetricString(trimmed, cups);
      if (converted) return trimmed.replace(tspMatch[0], converted);
    }
  }

  return trimmed;
}

function toggleGrocery(key, cb) {
  checkedGroceries[key] = cb.checked;
  const el = document.querySelector(`[data-key="${key}"]`);
  if (el) el.classList.toggle('checked', cb.checked);
}

function uncheckAll() {
  checkedGroceries = {};
  document.querySelectorAll('.grocery-item').forEach(el => {
    el.classList.remove('checked');
    const cb = el.querySelector('input');
    if (cb) cb.checked = false;
  });
}

function printGroceryList() {
  window.print();
}

function calculateDayKcal(meals) {
  if (!meals) return 0;
  return Object.values(meals).reduce((sum, m) => sum + (m?.kcal || 0), 0);
}

function calculateMacro(meals, key) {
  if (!meals) return 0;
  return Object.values(meals).reduce((sum, m) => sum + (m?.[key] || 0), 0);
}

function toggleCollapsible(btn) {
  const content = btn.nextElementSibling;
  const arrow = btn.querySelector('span');
  const isOpen = content.classList.toggle('open');
  if (arrow) arrow.textContent = isOpen ? '▲' : '▼';
}

function showLoading(text) {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = document.getElementById('loadingText');
  const progressFill = document.getElementById('loadingProgressFill');
  const progressText = document.getElementById('loadingProgressText');
  const tipEl = document.getElementById('loadingTip');

  if (!overlay || !textEl) return;

  clearInterval(loadingProgressInterval);
  clearInterval(loadingTipInterval);
  clearTimeout(loadingHideTimer);

  overlay.classList.add('open');
  textEl.textContent = text || 'Loading...';

  let progress = 4;
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = `${progress}%`;

  let tipIndex = 0;
  if (tipEl) tipEl.textContent = MEAL_LOADING_TIPS[tipIndex];

  loadingTipInterval = setInterval(() => {
    tipIndex = (tipIndex + 1) % MEAL_LOADING_TIPS.length;
    if (tipEl) tipEl.textContent = MEAL_LOADING_TIPS[tipIndex];
  }, 3200);

  loadingProgressInterval = setInterval(() => {
    progress = Math.min(92, progress + Math.floor(Math.random() * 6) + 2);
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (progressText) progressText.textContent = `${progress}%`;
  }, 700);
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  const progressFill = document.getElementById('loadingProgressFill');
  const progressText = document.getElementById('loadingProgressText');

  clearInterval(loadingProgressInterval);
  clearInterval(loadingTipInterval);

  if (progressFill) progressFill.style.width = '100%';
  if (progressText) progressText.textContent = '100%';

  loadingHideTimer = setTimeout(() => {
    if (overlay) overlay.classList.remove('open');
  }, 180);
}

function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

init();
