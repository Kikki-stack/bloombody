// Workout Planner + Timer logic

let currentPlan = null;
let activeWeek = 0;
let profileIntensityLevel = 'standard';
const TIMER_TOTAL_SETS = 3;
const TIMER_REPS_PER_EXERCISE = 3;
const TIMER_REP_REST_SECONDS = 15;
const TIMER_SET_REST_SECONDS = 40;
const TIMER_EXERCISE_PREP_SECONDS = 20;

// Timer state
let timerState = {
  running: false,
  paused: false,
  currentExerciseIdx: 0,
  prepTargetExerciseIdx: 0,
  currentSet: 1,
  currentRep: 1,
  phase: 'active', // 'active' | 'rep-rest' | 'exercise-prep' | 'set-rest'
  timeLeft: 60,
  totalDuration: 60,
  interval: null,
  exercises: [],
  workoutData: null,
  planId: null,
  weekNum: null,
  dayName: null
};

// Audio context for beeps
let audioCtx = null;

function toTimerInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isNaN(parsed)) return parsed;
  const match = String(value || '').match(/\d+/);
  if (match) return parseInt(match[0], 10);
  return fallback;
}

function getActiveSecondsByIntensity(level) {
  const intensity = String(level || '').toLowerCase();
  if (intensity === 'unmotivated') return 20;
  if (intensity === 'light') return 30;
  if (intensity === 'motivated') return 50;
  if (intensity === 'push_my_limits') return 60;
  return 40;
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playBeep(freq = 880, duration = 0.15, type = 'sine') {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

async function init() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/'; return; }
  const user = await res.json();
  document.getElementById('sidebarAvatar').textContent = user.username.charAt(0).toUpperCase();
  document.getElementById('sidebarUsername').textContent = user.username;

  try {
    const profileRes = await fetch('/api/profile');
    if (profileRes.ok) {
      const profile = await profileRes.json();
      profileIntensityLevel = profile?.intensity_level || 'standard';
    }
  } catch {}

  await loadCurrentPlan();
}

async function generateWorkoutPlan() {
  const focus = document.getElementById('focusMuscle').value;
  const notes = document.getElementById('workoutNotes').value.trim();

  showLoading('Generating your personalised 4-week workout plan... This takes about 30 seconds.');

  try {
    const res = await fetch('/api/workouts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focus_muscle: focus, extra_notes: notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');

    currentPlan = data;
    hideLoading();
    renderPlan();
    showToast('✅ Workout plan generated!', 'success');
  } catch (err) {
    hideLoading();
    showToast('❌ ' + err.message, 'error');
  }
}

async function loadCurrentPlan() {
  try {
    const res = await fetch('/api/workouts/current');
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    currentPlan = data;
    renderPlan();
  } catch {}
}

function renderPlan() {
  if (!currentPlan || !currentPlan.weeks) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('workoutPlanArea').style.display = 'block';
  document.getElementById('planOverview').style.display = 'block';

  // Plan overview
  document.getElementById('planName').textContent = currentPlan.plan_name || '4-Week Workout Plan';
  document.getElementById('planOverviewText').textContent = currentPlan.overview || '';

  // Progress
  const progress = currentPlan.progress || [];
  const totalWorkouts = currentPlan.weeks.reduce((sum, w) => sum + (w.workouts || []).length, 0);
  const done = progress.length;
  const pct = totalWorkouts > 0 ? Math.round((done / totalWorkouts) * 100) : 0;

  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPercent').textContent = pct + '%';
  document.getElementById('planProgressBadge').textContent = `${done}/${totalWorkouts} workouts done`;
  document.getElementById('planProgressBadge').className = done === totalWorkouts && totalWorkouts > 0 ? 'badge badge-green' : 'badge badge-blue';

  // Checkup banner
  if (currentPlan.completed) {
    document.getElementById('checkupBanner').style.display = 'block';
  }

  renderWeeklyCheckinCard();

  // Week tabs
  const tabNav = document.getElementById('weekTabNav');
  tabNav.innerHTML = '';
  currentPlan.weeks.forEach((week, i) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${i === activeWeek ? 'active' : ''}`;
    btn.textContent = `Week ${week.week} — ${week.focus || ''}`;
    btn.onclick = () => { activeWeek = i; renderWeek(); updateWeekTabs(); };
    tabNav.appendChild(btn);
  });

  renderWeek();
}

function renderWeeklyCheckinCard() {
  const card = document.getElementById('weeklyCheckinCard');
  const select = document.getElementById('weeklyCheckinWeek');
  if (!card || !select || !currentPlan?.weeks?.length) return;

  card.style.display = 'block';
  const oldValue = parseInt(select.value, 10);
  select.innerHTML = '';

  currentPlan.weeks.forEach(week => {
    const opt = document.createElement('option');
    opt.value = week.week;
    opt.textContent = `Week ${week.week}`;
    select.appendChild(opt);
  });

  if (oldValue && currentPlan.weeks.some(week => week.week === oldValue)) {
    select.value = String(oldValue);
  }

  loadWeeklyCheckinStatus();
}

async function loadWeeklyCheckinStatus() {
  const select = document.getElementById('weeklyCheckinWeek');
  const statusEl = document.getElementById('weeklyCheckinStatus');
  const btn = document.getElementById('weeklyCheckinBtn');
  if (!select || !statusEl || !btn) return;

  const week = parseInt(select.value, 10) || 1;

  try {
    const res = await fetch(`/api/checkins/weekly-status?week=${week}`);
    if (!res.ok) throw new Error('Unable to load weekly check-in status');
    const status = await res.json();

    statusEl.textContent = status.message;
    statusEl.style.color = status.eligible ? 'var(--green-700)' : 'var(--text-secondary)';
    btn.disabled = !status.eligible;
  } catch {
    statusEl.textContent = 'Could not load weekly check-in status right now.';
    statusEl.style.color = 'var(--text-secondary)';
    btn.disabled = true;
  }
}

async function submitWeeklyCheckin() {
  const week = parseInt(document.getElementById('weeklyCheckinWeek')?.value, 10) || 1;
  const workoutFeedback = document.getElementById('weeklyWorkoutFeedback')?.value.trim() || '';
  const mealFeedback = document.getElementById('weeklyMealFeedback')?.value.trim() || '';
  const resultEl = document.getElementById('weeklyCheckinResult');

  if (!resultEl) return;

  resultEl.innerHTML = '<p style="font-size:13px; color:var(--text-secondary);">Running weekly check-in...</p>';

  try {
    const res = await fetch('/api/checkins/weekly-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week,
        workout_feedback: workoutFeedback,
        meal_feedback: mealFeedback
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to run weekly check-in');

    const review = data.review || {};
    const workoutChanges = Array.isArray(review.workout_changes) ? review.workout_changes : [];
    const mealChanges = Array.isArray(review.meal_changes) ? review.meal_changes : [];

    resultEl.innerHTML = `
      <div class="card" style="background:var(--bg-soft); border:1px solid var(--line);">
        <div class="card-body" style="padding:14px;">
          <div style="font-size:14px; font-weight:700; margin-bottom:8px;">Week ${week} Review</div>
          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:8px;">${review.summary || 'No summary generated.'}</p>
          <div style="margin-bottom:8px; font-size:13px;">
            <strong>Changes needed:</strong> ${review.changes_needed ? 'Yes' : 'No'}
          </div>
          <div style="font-size:13px; margin-bottom:8px;"><strong>Workout changes:</strong> ${workoutChanges.length ? workoutChanges.join(' | ') : 'None'}</div>
          <div style="font-size:13px; margin-bottom:8px;"><strong>Meal changes:</strong> ${mealChanges.length ? mealChanges.join(' | ') : 'None'}</div>
          <div style="font-size:13px; margin-bottom:6px;"><strong>Next week focus:</strong> ${review.next_week_focus || 'Stay consistent.'}</div>
          <div style="font-size:13px;"><strong>Motivation tip:</strong> ${review.motivation_tip || 'Small, consistent actions beat perfect plans.'}</div>
        </div>
      </div>
    `;

    showToast('✅ Weekly check-in completed!', 'success');
  } catch (err) {
    resultEl.innerHTML = `<p style="font-size:13px; color:#b91c1c;">${err.message}</p>`;
    showToast('❌ ' + err.message, 'error');
  }
}

function updateWeekTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === activeWeek);
  });
}

function renderWeek() {
  const week = currentPlan.weeks[activeWeek];
  if (!week) return;

  const content = document.getElementById('weekContent');
  content.innerHTML = '';

  // Week description
  if (week.description) {
    const desc = document.createElement('p');
    desc.style.cssText = 'font-size:14px; color:var(--text-secondary); margin-bottom:16px; padding:14px 18px; background:var(--bg); border-radius:var(--radius-sm);';
    desc.innerHTML = `<strong>Week ${week.week}:</strong> ${week.description}`;
    content.appendChild(desc);
  }

  const grid = document.createElement('div');
  grid.className = 'workout-week-grid fade-in';

  const progress = currentPlan.progress || [];
  const doneSet = new Set(progress.map(p => `${p.week}-${p.day_name}`));

  // Workout days
  (week.workouts || []).forEach(workout => {
    const key = `${week.week}-${workout.day}`;
    const isDone = doneSet.has(key);
    const card = document.createElement('div');
    card.className = `workout-day-card ${isDone ? 'completed' : ''}`;
    card.onclick = () => openWorkoutModal(workout, week.week);

    const exList = (workout.exercises || []).slice(0, 4).map(e =>
      `<li>• ${e.name} — ${e.sets}×${e.reps} reps</li>`
    ).join('');

    card.innerHTML = `
      <div class="workout-day-header">
        <div>
          <div class="workout-day-name">${workout.day}</div>
          <div class="workout-day-type">${workout.type || ''}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          ${isDone ? '<span class="badge badge-green">✓ Done</span>' : '<span class="badge badge-gray">Pending</span>'}
          <span style="font-size:12px; color:var(--text-muted);">${workout.duration_minutes || '?'} min</span>
        </div>
      </div>
      <div class="workout-day-body">
        <ul class="exercise-list-preview">${exList}</ul>
        ${workout.exercises && workout.exercises.length > 4 ? `<div style="font-size:12px; color:var(--text-muted); margin-top:6px;">+${workout.exercises.length - 4} more exercises</div>` : ''}
        <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:6px;">
          ${(workout.muscle_groups || []).map(mg => `<span class="badge badge-blue">${mg}</span>`).join('')}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Rest days
  (week.rest_days || []).forEach(day => {
    const card = document.createElement('div');
    card.className = 'rest-day-card';
    card.innerHTML = `
      <div class="rest-day-icon">😴</div>
      <div class="rest-day-name">${day}</div>
      <div class="rest-day-label">Rest Day — Recovery is key!</div>
    `;
    grid.appendChild(card);
  });

  content.appendChild(grid);
}

function openWorkoutModal(workout, weekNum) {
  const modal = document.getElementById('workoutModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  title.textContent = `${workout.day} — ${workout.type || 'Workout'}`;

  const progress = currentPlan.progress || [];
  const key = `${weekNum}-${workout.day}`;
  const isDone = progress.some(p => `${p.week}-${p.day_name}` === key);
  const timerActiveSeconds = getActiveSecondsByIntensity(profileIntensityLevel || currentPlan?.intensity_level);

  let html = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px;">
      ${(workout.muscle_groups || []).map(mg => `<span class="badge badge-blue">${mg}</span>`).join('')}
      <span class="badge badge-gray">⏱ ${workout.duration_minutes || '?'} min</span>
      ${isDone ? '<span class="badge badge-green">✓ Completed</span>' : ''}
    </div>
  `;

  (workout.exercises || []).forEach((ex, i) => {
    html += `
      <div class="exercise-card">
        <div class="exercise-name">${i + 1}. ${ex.name}</div>
        <div class="exercise-muscle">${ex.muscle_group || ''}</div>
        <div class="exercise-meta">
          <span class="badge badge-green">${TIMER_TOTAL_SETS} sets</span>
          <span class="badge badge-blue">${TIMER_REPS_PER_EXERCISE} reps</span>
          <span class="badge badge-amber">${timerActiveSeconds}s active</span>
          <span class="badge badge-gray">${TIMER_REP_REST_SECONDS}s rep rest</span>
          <span class="badge badge-gray">${TIMER_SET_REST_SECONDS}s set break</span>
        </div>
        <div class="exercise-desc">${ex.description || ''}</div>
        <div class="exercise-mods">
          ${ex.easier ? `<span class="mod-tag mod-easier">💙 Easier: ${ex.easier}</span>` : ''}
          ${ex.harder ? `<span class="mod-tag mod-harder">🔥 Harder: ${ex.harder}</span>` : ''}
        </div>
      </div>
    `;
  });

  html += `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:20px;">
      <button class="btn btn-primary" onclick="startTimerWorkout(${JSON.stringify(workout).replace(/"/g, '&quot;')}, ${weekNum})">
        ▶ Start Workout with Timer
      </button>
      ${!isDone ? `<button class="btn btn-secondary" onclick="markDone(${weekNum}, '${workout.day}')">✓ Mark as Done (no timer)</button>` : ''}
    </div>
  `;

  body.innerHTML = html;
  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('workoutModal').classList.remove('open');
}

function startTimerWorkout(workout, weekNum) {
  closeModal();
  if (!workout.exercises || !workout.exercises.length) {
    showToast('No exercises in this workout.', 'error');
    return;
  }

  const activeSeconds = getActiveSecondsByIntensity(profileIntensityLevel || currentPlan?.intensity_level);
  const normalizedExercises = (workout.exercises || []).map(exercise => ({
    ...exercise,
    active_seconds: activeSeconds,
    rest_between_reps_seconds: TIMER_REP_REST_SECONDS,
    rest_between_sets_seconds: TIMER_SET_REST_SECONDS
  }));

  timerState = {
    running: false,
    paused: false,
    currentExerciseIdx: 0,
    prepTargetExerciseIdx: 0,
    currentSet: 1,
    currentRep: 1,
    phase: 'exercise-prep',
    timeLeft: TIMER_EXERCISE_PREP_SECONDS,
    totalDuration: TIMER_EXERCISE_PREP_SECONDS,
    interval: null,
    exercises: normalizedExercises,
    workoutData: workout,
    planId: currentPlan.id,
    weekNum: weekNum,
    dayName: workout.day
  };

  document.getElementById('timerOverlay').classList.add('open');
  updateTimerDisplay();
}

function toggleTimer() {
  if (!timerState.running) {
    startTimer();
  } else if (!timerState.paused) {
    pauseTimer();
  } else {
    resumeTimer();
  }
}

function startTimer() {
  timerState.running = true;
  timerState.paused = false;
  document.getElementById('timerStartBtn').textContent = '⏸ Pause';
  document.getElementById('timerStartBtn').className = 'timer-btn timer-btn-pause';
  runTick();
}

function pauseTimer() {
  timerState.paused = true;
  clearInterval(timerState.interval);
  document.getElementById('timerStartBtn').textContent = '▶ Resume';
  document.getElementById('timerStartBtn').className = 'timer-btn timer-btn-start';
}

function resumeTimer() {
  timerState.paused = false;
  document.getElementById('timerStartBtn').textContent = '⏸ Pause';
  document.getElementById('timerStartBtn').className = 'timer-btn timer-btn-pause';
  runTick();
}

function runTick() {
  clearInterval(timerState.interval);
  timerState.interval = setInterval(() => {
    timerState.timeLeft--;

    // Countdown beeps at 3, 2, 1
    if (timerState.timeLeft <= 3 && timerState.timeLeft > 0) {
      playBeep(440, 0.1);
    }

    if (timerState.timeLeft <= 0) {
      playBeep(880, 0.2);
      advancePhase();
    }

    updateTimerDisplay();
  }, 1000);
}

function advancePhase() {
  const ex = timerState.exercises[timerState.currentExerciseIdx];
  if (!ex) { endWorkout(); return; }

  if (timerState.phase === 'active') {
    if (timerState.currentRep < TIMER_REPS_PER_EXERCISE) {
      timerState.phase = 'rep-rest';
      timerState.timeLeft = TIMER_REP_REST_SECONDS;
      timerState.totalDuration = TIMER_REP_REST_SECONDS;
    } else {
      const isLastExerciseInSet = timerState.currentExerciseIdx >= timerState.exercises.length - 1;

      if (!isLastExerciseInSet) {
        timerState.prepTargetExerciseIdx = timerState.currentExerciseIdx + 1;
        timerState.phase = 'exercise-prep';
        timerState.timeLeft = TIMER_EXERCISE_PREP_SECONDS;
        timerState.totalDuration = TIMER_EXERCISE_PREP_SECONDS;
        playBeep(660, 0.2);
      } else if (timerState.currentSet < TIMER_TOTAL_SETS) {
        timerState.phase = 'set-rest';
        timerState.timeLeft = TIMER_SET_REST_SECONDS;
        timerState.totalDuration = TIMER_SET_REST_SECONDS;
      } else {
        endWorkout();
      }
    }
  } else if (timerState.phase === 'rep-rest') {
    timerState.currentRep++;
    timerState.phase = 'active';
    timerState.timeLeft = ex.active_seconds || 60;
    timerState.totalDuration = ex.active_seconds || 60;
  } else if (timerState.phase === 'exercise-prep') {
    timerState.currentExerciseIdx = Math.max(
      0,
      Math.min(timerState.exercises.length - 1, toTimerInt(timerState.prepTargetExerciseIdx, timerState.currentExerciseIdx))
    );
    timerState.currentRep = 1;
    const nextExercise = timerState.exercises[timerState.currentExerciseIdx];
    if (!nextExercise) {
      endWorkout();
      return;
    }
    timerState.phase = 'active';
    timerState.timeLeft = nextExercise.active_seconds || getActiveSecondsByIntensity(profileIntensityLevel);
    timerState.totalDuration = timerState.timeLeft;
    playBeep(740, 0.2);
  } else if (timerState.phase === 'set-rest') {
    timerState.currentSet++;
    timerState.prepTargetExerciseIdx = 0;
    timerState.currentRep = 1;
    timerState.phase = 'exercise-prep';
    timerState.timeLeft = TIMER_EXERCISE_PREP_SECONDS;
    timerState.totalDuration = TIMER_EXERCISE_PREP_SECONDS;
    playBeep(740, 0.25);
  }
}

function skipPhase() {
  timerState.timeLeft = 1;
}

function updateTimerDisplay() {
  const currentExercise = timerState.exercises[timerState.currentExerciseIdx];
  const prepTargetExercise = timerState.exercises[toTimerInt(timerState.prepTargetExerciseIdx, timerState.currentExerciseIdx)];
  const nextExercise = timerState.exercises[timerState.currentExerciseIdx + 1];

  if (!currentExercise) return;

  const displayExercise = timerState.phase === 'exercise-prep'
    ? (prepTargetExercise || nextExercise || currentExercise)
    : currentExercise;

  // Exercise name
  document.getElementById('timerExerciseName').textContent = displayExercise.name;
  document.getElementById('timerExerciseCounter').textContent =
    timerState.phase === 'exercise-prep'
      ? `Next exercise ${Math.min(toTimerInt(timerState.prepTargetExerciseIdx, timerState.currentExerciseIdx) + 1, timerState.exercises.length)} of ${timerState.exercises.length}`
      : `Exercise ${timerState.currentExerciseIdx + 1} of ${timerState.exercises.length}`;

  // Set/rep info
  document.getElementById('timerSetInfo').textContent =
    timerState.phase === 'exercise-prep'
      ? `Set ${timerState.currentSet} of ${TIMER_TOTAL_SETS} — Preparing next exercise`
      : `Set ${timerState.currentSet} of ${TIMER_TOTAL_SETS} — Rep ${timerState.currentRep} of ${TIMER_REPS_PER_EXERCISE}`;

  // Time
  const mins = Math.floor(timerState.timeLeft / 60);
  const secs = timerState.timeLeft % 60;
  document.getElementById('timerTime').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Phase label
  const phaseEl = document.getElementById('timerPhase');
  const progressEl = document.getElementById('timerRingProgress');
  if (timerState.phase === 'active') {
    phaseEl.textContent = 'EXERCISE TIME';
    phaseEl.className = 'timer-phase active-phase';
    progressEl.className = 'timer-ring-progress';
  } else if (timerState.phase === 'rep-rest') {
    phaseEl.textContent = 'REST BETWEEN REPS';
    phaseEl.className = 'timer-phase rep-rest';
    progressEl.className = 'timer-ring-progress rest';
  } else if (timerState.phase === 'exercise-prep') {
    phaseEl.textContent = 'NEXT EXERCISE PREP';
    phaseEl.className = 'timer-phase rep-rest';
    progressEl.className = 'timer-ring-progress rest';
  } else {
    phaseEl.textContent = 'SET BREAK (ALL EXERCISES DONE)';
    phaseEl.className = 'timer-phase set-rest';
    progressEl.className = 'timer-ring-progress set-rest';
  }

  // Ring progress (628 = 2*pi*100)
  const fraction = timerState.timeLeft / timerState.totalDuration;
  const dashOffset = 628 * (1 - fraction);
  progressEl.style.strokeDashoffset = dashOffset;

  // Description
  document.getElementById('timerExerciseDesc').textContent =
    timerState.phase === 'exercise-prep'
      ? `Coming up: ${displayExercise.description || 'Get ready for the next movement.'}`
      : (displayExercise.description || '');

  // Modifications
  const easierEl = document.getElementById('timerModEasier');
  const harderEl = document.getElementById('timerModHarder');
  easierEl.textContent = displayExercise.easier ? `💙 Easier: ${displayExercise.easier}` : '';
  easierEl.style.display = displayExercise.easier ? 'inline-flex' : 'none';
  harderEl.textContent = displayExercise.harder ? `🔥 Harder: ${displayExercise.harder}` : '';
  harderEl.style.display = displayExercise.harder ? 'inline-flex' : 'none';

  // Overall progress
  const totalWorkBlocks = timerState.exercises.length * TIMER_TOTAL_SETS * TIMER_REPS_PER_EXERCISE;
  const completedSetsBeforeCurrent = (timerState.currentSet - 1) * timerState.exercises.length * TIMER_REPS_PER_EXERCISE;
  const completedExercisesBeforeCurrent = timerState.currentExerciseIdx * TIMER_REPS_PER_EXERCISE;
  const completedRepsBeforeCurrent = Math.max(0, timerState.currentRep - 1);
  const completedBlocks = completedSetsBeforeCurrent + completedExercisesBeforeCurrent + completedRepsBeforeCurrent;
  const pct = totalWorkBlocks > 0 ? Math.min(100, Math.round((completedBlocks / totalWorkBlocks) * 100)) : 0;
  document.getElementById('timerProgressFill').style.width = pct + '%';
  document.getElementById('timerOverallProgress').textContent = `${completedBlocks}/${totalWorkBlocks} intervals`;
}

async function endWorkout() {
  clearInterval(timerState.interval);
  timerState.running = false;

  // Mark as complete
  try {
    await fetch('/api/workouts/complete-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workout_plan_id: timerState.planId,
        week: timerState.weekNum,
        day_name: timerState.dayName,
        notes: 'Completed with timer'
      })
    });
  } catch {}

  // Show completion
  const overlay = document.getElementById('timerOverlay');
  overlay.innerHTML = `
    <div style="text-align:center; padding:40px 20px;">
      <div style="font-size:72px; margin-bottom:20px;">🎉</div>
      <h2 style="font-size:28px; font-weight:800; color:#fff; margin-bottom:12px;">Workout Complete!</h2>
      <p style="font-size:16px; color:#94a3b8; margin-bottom:8px;">You crushed ${timerState.exercises.length} exercises!</p>
      <p style="font-size:14px; color:#64748b; margin-bottom:36px;">${timerState.dayName} — Week ${timerState.weekNum}</p>
      <button class="timer-btn timer-btn-start" style="font-size:16px; padding:16px 36px;" onclick="closeTimerOverlay()">
        View Progress
      </button>
    </div>
  `;

  playBeep(523, 0.3);
  setTimeout(() => playBeep(659, 0.3), 300);
  setTimeout(() => playBeep(784, 0.3), 600);
}

function closeTimerOverlay() {
  // Reload the page to show updated progress
  window.location.reload();
}

function quitWorkout() {
  clearInterval(timerState.interval);
  if (confirm('Are you sure you want to quit the workout?')) {
    document.getElementById('timerOverlay').classList.remove('open');
    timerState = { ...timerState, running: false };
  } else {
    if (timerState.running && !timerState.paused) runTick();
  }
}

async function markDone(weekNum, dayName) {
  closeModal();
  try {
    await fetch('/api/workouts/complete-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workout_plan_id: currentPlan.id,
        week: weekNum,
        day_name: dayName,
        notes: 'Marked complete manually'
      })
    });
    showToast('✅ Workout marked as complete!', 'success');
    await loadCurrentPlan();
  } catch {
    showToast('Failed to save progress.', 'error');
  }
}

function showCheckupModal() {
  document.getElementById('checkupModal').classList.add('open');
}

function closeCheckupModal() {
  document.getElementById('checkupModal').classList.remove('open');
}

async function submitCheckup() {
  const feedback = document.getElementById('checkupFeedback').value.trim();
  const newFocus = document.getElementById('checkupFocus').value;
  const difficulty = document.getElementById('checkupDifficulty').value;

  closeCheckupModal();
  showLoading('Generating your new improved workout plan based on your feedback...');

  try {
    const res = await fetch('/api/workouts/checkup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedback,
        new_focus: newFocus,
        change_difficulty: difficulty
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate');

    currentPlan = data;
    hideLoading();
    activeWeek = 0;
    renderPlan();
    document.getElementById('checkupBanner').style.display = 'none';
    showToast('✅ New plan generated!', 'success');
  } catch (err) {
    hideLoading();
    showToast('❌ ' + err.message, 'error');
  }
}

function showLoading(text) {
  document.getElementById('loadingOverlay').classList.add('open');
  document.getElementById('loadingText').textContent = text || 'Loading...';
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('open');
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

// Close modals on overlay click
document.getElementById('workoutModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('checkupModal').addEventListener('click', function(e) {
  if (e.target === this) closeCheckupModal();
});

init();
