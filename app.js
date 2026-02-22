// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand(); // Разворачиваем на весь экран
tg.enableClosingConfirmation(); // Подтверждение при закрытии

// Настройка темы Telegram
const theme = tg.themeParams;
document.body.style.backgroundColor = theme.bg_color || '#1a1f2e';

// Глобальные переменные
let currentUser = null;
let measurements = [];
let trainingPlans = {};
let currentMeasurementStep = 1;
let radarChart = null;
let historyChart = null;

// Эталонные уровни команд (на основе данных Opta)
const TEAM_LEVELS = [
    { name: 'Любительская лига', ovr: 45, tier: 1, color: '#94a3b8' },
    { name: 'ДЮСШ', ovr: 55, tier: 2, color: '#60a5fa' },
    { name: 'ФНЛ', ovr: 65, tier: 3, color: '#34d399' },
    { name: 'РПЛ', ovr: 76, tier: 4, color: '#fbbf24' },
    { name: 'Топ-5 Европы', ovr: 85, tier: 5, color: '#f97316' },
    { name: 'АПЛ', ovr: 93, tier: 6, color: '#ef4444' }
];

// Библиотека упражнений
const EXERCISES = {
    speed: [
        { name: 'Спринты 20м', description: '5 повторений с максимальным ускорением', duration: 15, difficulty: 3 },
        { name: 'Старты из разных положений', description: 'Из упора лежа, сидя, лежа на спине', duration: 20, difficulty: 4 },
        { name: 'Ускорения с мячом', description: 'Ведение мяча на максимальной скорости', duration: 15, difficulty: 4 }
    ],
    endurance: [
        { name: 'Интервальный бег 400м', description: '400м быстро / 200м трусцой, 6 повторений', duration: 25, difficulty: 4 },
        { name: 'Фартлек', description: '10×1 мин быстро / 1 мин медленно', duration: 30, difficulty: 5 },
        { name: 'Кросс 3км', description: 'Равномерный бег на пульсе 150-160', duration: 20, difficulty: 3 }
    ],
    strength: [
        { name: 'Приседания с выпрыгиванием', description: '4×12 взрывных приседаний', duration: 15, difficulty: 4 },
        { name: 'Берпи с отжиманием', description: '3×15 берпи', duration: 10, difficulty: 3 },
        { name: 'Выпады с гантелями', description: '4×10 на каждую ногу', duration: 15, difficulty: 3 }
    ],
    technique: [
        { name: 'Ведение змейкой', description: 'Обводка 10 фишек на скорость, 6 повторений', duration: 20, difficulty: 3 },
        { name: 'Жонглирование', description: '5 подходов по 1 минуте', duration: 15, difficulty: 2 },
        { name: 'Квадрат 4×2', description: 'Игра в квадрат с одноклубниками', duration: 25, difficulty: 4 }
    ],
    coordination: [
        { name: 'Координационная лестница', description: '5 вариантов забеганий', duration: 15, difficulty: 3 },
        { name: 'Челночный бег 5×10м', description: '3 серии с касанием линии', duration: 10, difficulty: 4 },
        { name: 'Прыжки на одной ноге', description: '3×20м на каждой ноге', duration: 10, difficulty: 3 }
    ],
    recovery: [
        { name: 'Растяжка всего тела', description: 'Статическая растяжка всех групп мышц', duration: 20, difficulty: 1 },
        { name: 'Легкая пробежка', description: 'Бег трусцой 20 минут', duration: 20, difficulty: 1 },
        { name: 'Плавание', description: 'Спокойное плавание в бассейне', duration: 30, difficulty: 1 }
    ]
};

// Загрузка данных из Telegram Cloud Storage
async function loadData() {
    showScreen('loading');
    
    try {
        // Получаем данные пользователя из Telegram
        currentUser = tg.initDataUnsafe?.user || {
            id: Math.random().toString(36).substring(7),
            first_name: 'Игрок',
            username: 'player',
            photo_url: 'https://ui-avatars.com/api/?name=Player&background=random'
        };
        
        updateUserInfo();
        
        // Загружаем сохраненные данные
        const savedMeasurements = await tg.CloudStorage.getItem('measurements');
        const savedTraining = await tg.CloudStorage.getItem('training');
        
        measurements = savedMeasurements ? JSON.parse(savedMeasurements) : [];
        trainingPlans = savedTraining ? JSON.parse(savedTraining) : {};
        
        // Если нет замеров - показываем экран замера
        if (measurements.length === 0) {
            showScreen('measurement');
        } else {
            updateDashboard();
            showScreen('dashboard');
        }
        
        // Генерируем тренировку на сегодня если нет
        generateTodayTraining();
    } catch (error) {
        console.error('Error loading data:', error);
        showScreen('dashboard');
    }
}

// Сохранение данных в Telegram Cloud Storage
async function saveData() {
    try {
        await tg.CloudStorage.setItem('measurements', JSON.stringify(measurements));
        await tg.CloudStorage.setItem('training', JSON.stringify(trainingPlans));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Обновление информации о пользователе
function updateUserInfo() {
    document.getElementById('user-name').textContent = currentUser.first_name;
    document.getElementById('profile-name').textContent = currentUser.first_name;
    document.getElementById('profile-username').textContent = `@${currentUser.username || 'player'}`;
    
    const avatarUrl = currentUser.photo_url || `https://ui-avatars.com/api/?name=${currentUser.first_name}&background=random`;
    document.getElementById('user-avatar').src = avatarUrl;
    document.getElementById('profile-avatar').src = avatarUrl;
}

// Расчет OVR на основе замеров
function calculateOVR(measurement) {
    const scores = {
        speed: calculateSpeedScore(measurement),
        endurance: calculateEnduranceScore(measurement),
        strength: calculateStrengthScore(measurement),
        technique: calculateTechniqueScore(measurement),
        coordination: calculateCoordinationScore(measurement)
    };
    
    const weights = {
        speed: 0.25,
        endurance: 0.2,
        strength: 0.2,
        technique: 0.2,
        coordination: 0.15
    };
    
    let ovr = 0;
    const details = {};
    
    for (const [key, value] of Object.entries(scores)) {
        ovr += value * weights[key];
        details[key] = Math.round(value);
    }
    
    return {
        ovr: Math.round(ovr),
        details,
        weaknesses: Object.entries(scores)
            .filter(([_, v]) => v < 40)
            .map(([k]) => k),
        strengths: Object.entries(scores)
            .filter(([_, v]) => v > 70)
            .map(([k]) => k)
    };
}

function calculateSpeedScore(m) {
    if (!m.sprint20m) return 50;
    const score = 100 - ((m.sprint20m - 2.5) / 1.5 * 100);
    return Math.min(100, Math.max(0, score));
}

function calculateEnduranceScore(m) {
    if (!m.coopersTest) return 50;
    const vo2max = (m.coopersTest - 504) / 45;
    const score = (vo2max - 30) / 30 * 100;
    return Math.min(100, Math.max(0, score));
}

function calculateStrengthScore(m) {
    if (!m.pushups) return 50;
    const strengthScore = (m.pushups / 60) * 100;
    return Math.min(100, Math.max(0, strengthScore));
}

function calculateTechniqueScore(m) {
    if (!m.juggling) return 50;
    const techniqueScore = (m.juggling / 200) * 100;
    return Math.min(100, Math.max(0, techniqueScore));
}

function calculateCoordinationScore(m) {
    if (!m.burpees) return 50;
    const coordinationScore = (m.burpees / 30) * 100;
    return Math.min(100, Math.max(0, coordinationScore));
}

// Обновление дашборда
function updateDashboard() {
    if (measurements.length === 0) return;
    
    const latest = measurements[0];
    const ovrResult = calculateOVR(latest);
    
    // Обновляем OVR
    document.getElementById('ovr-display').innerHTML = `
        <span class="ovr-value">${ovrResult.ovr}</span>
        <span class="ovr-label">OVR</span>
    `;
    
    // Обновляем график
    updateRadarChart(ovrResult.details);
    
    // Обновляем сравнение с лигами
    updateTeamComparison(ovrResult.ovr);
}

// Обновление радар-графика
function updateRadarChart(details) {
    const ctx = document.getElementById('radar-chart').getContext('2d');
    
    if (radarChart) {
        radarChart.destroy();
    }
    
    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Скорость', 'Выносливость', 'Сила', 'Техника', 'Координация'],
            datasets: [{
                label: 'Твои показатели',
                data: [details.speed, details.endurance, details.strength, details.technique, details.coordination],
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                borderColor: '#22c55e',
                borderWidth: 2,
                pointBackgroundColor: '#22c55e'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: '#334155' },
                    pointLabels: { color: '#94a3b8' },
                    ticks: { color: '#64748b' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f1f5f9' } }
            }
        }
    });
}

// Сравнение с командами
function updateTeamComparison(ovr) {
    const container = document.getElementById('team-levels');
    let html = '';
    
    TEAM_LEVELS.forEach(level => {
        const progress = Math.min(100, (ovr / level.ovr) * 100);
        const reached = ovr >= level.ovr;
        
        html += `
            <div class="team-level-item">
                <div class="team-level-header">
                    <span>${level.name}</span>
                    <span style="color: ${level.color}">${level.ovr} OVR</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progress}%; background: ${level.color}"></div>
                </div>
                ${reached ? '<span class="reached-badge">✓ Достигнут</span>' : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Генерация тренировки на сегодня
function generateTodayTraining() {
    const today = new Date().toDateString();
    
    // Если уже есть тренировка на сегодня
    if (trainingPlans[today]) {
        displayTodayTraining(trainingPlans[today]);
        return;
    }
    
    // Нет замеров - базовая тренировка
    if (measurements.length === 0) {
        const baseTraining = {
            focus: ['general'],
            duration: 45,
            exercises: [
                EXERCISES.coordination[0],
                EXERCISES.strength[1],
                EXERCISES.technique[1]
            ]
        };
        trainingPlans[today] = baseTraining;
        displayTodayTraining(baseTraining);
        saveData();
        return;
    }
    
    // Есть замеры - персонализированная тренировка
    const latest = measurements[0];
    const ovrResult = calculateOVR(latest);
    
    // Берем 2 слабых места или технику/скорость если нет слабых
    const focusAreas = ovrResult.weaknesses.length > 0 
        ? ovrResult.weaknesses.slice(0, 2)
        : ['technique', 'speed'];
    
    const training = {
        focus: focusAreas,
        duration: 0,
        exercises: []
    };
    
    // Добавляем упражнения
    focusAreas.forEach(area => {
        const areaExercises = EXERCISES[area] || [];
        const selected = areaExercises.slice(0, 2);
        training.exercises.push(...selected);
    });
    
    // Добавляем разминку и заминку
    training.exercises.unshift({ 
        name: 'Разминка', 
        description: 'Бег трусцой, динамическая растяжка', 
        duration: 10,
        isWarmup: true 
    });
    
    training.exercises.push(EXERCISES.recovery[0]);
    
    // Считаем длительность
    training.duration = training.exercises.reduce((sum, e) => sum + (e.duration || 10), 0);
    
    trainingPlans[today] = training;
    displayTodayTraining(training);
    saveData();
}

// Отображение тренировки
function displayTodayTraining(training) {
    document.getElementById('training-focus').textContent = 
        training.focus.map(f => {
            const names = { speed: 'Скорость', endurance: 'Выносливость', strength: 'Сила', 
                          technique: 'Техника', coordination: 'Координация', recovery: 'Восстановление',
                          general: 'Общая' };
            return names[f] || f;
        }).join(', ');
    
    document.getElementById('training-duration').textContent = `${training.duration} мин`;
    
    let exercisesHtml = '';
    training.exercises.forEach(ex => {
        exercisesHtml += `
            <div class="exercise-item">
                <div class="exercise-name">${ex.name}</div>
                <div class="exercise-desc">${ex.description}</div>
                <div class="exercise-duration">${ex.duration} мин</div>
            </div>
        `;
    });
    
    document.getElementById('training-exercises').innerHTML = exercisesHtml;
    document.getElementById('start-training').style.display = 'block';
}

// Навигация по экранам
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(`${screenId}-screen`).classList.add('active');
    
    // Обновляем данные при показе экранов
    if (screenId === 'history') updateHistoryScreen();
    if (screenId === 'calendar') renderCalendar();
    if (screenId === 'profile') updateProfileScreen();
}

// Навигация по шагам замера
function nextMeasurementStep() {
    // Сохраняем данные текущего шага
    saveCurrentStepData();
    
    if (currentMeasurementStep < 5) {
        document.querySelector(`[data-step="${currentMeasurementStep}"]`).style.display = 'none';
        currentMeasurementStep++;
        document.querySelector(`[data-step="${currentMeasurementStep}"]`).style.display = 'block';
        document.getElementById('measurement-step').textContent = `${currentMeasurementStep}/5`;
        document.getElementById('measurement-progress-bar').style.width = `${(currentMeasurementStep/5)*100}%`;
        document.getElementById('prev-step').disabled = false;
    } else {
        // Завершаем замер
        finishMeasurement();
    }
}

function prevMeasurementStep() {
    if (currentMeasurementStep > 1) {
        document.querySelector(`[data-step="${currentMeasurementStep}"]`).style.display = 'none';
        currentMeasurementStep--;
        document.querySelector(`[data-step="${currentMeasurementStep}"]`).style.display = 'block';
        document.getElementById('measurement-step').textContent = `${currentMeasurementStep}/5`;
        document.getElementById('measurement-progress-bar').style.width = `${(currentMeasurementStep/5)*100}%`;
    }
    
    if (currentMeasurementStep === 1) {
        document.getElementById('prev-step').disabled = true;
    }
}

function saveCurrentStepData() {
    const stepData = {};
    
    if (currentMeasurementStep === 1) {
        stepData.sprint20m = parseFloat(document.getElementById('sprint20m').value) || null;
        stepData.sprint40m = parseFloat(document.getElementById('sprint40m').value) || null;
    } else if (currentMeasurementStep === 2) {
        stepData.coopersTest = parseFloat(document.getElementById('coopersTest').value) || null;
        stepData.recoveryRate = parseFloat(document.getElementById('recoveryRate').value) || null;
    } else if (currentMeasurementStep === 3) {
        stepData.pushups = parseInt(document.getElementById('pushups').value) || null;
        stepData.situps = parseInt(document.getElementById('situps').value) || null;
        stepData.squats = parseInt(document.getElementById('squats').value) || null;
    } else if (currentMeasurementStep === 4) {
        stepData.juggling = parseInt(document.getElementById('juggling').value) || null;
        stepData.dribbling = parseFloat(document.getElementById('dribbling').value) || null;
    } else if (currentMeasurementStep === 5) {
        stepData.burpees = parseInt(document.getElementById('burpees').value) || null;
        stepData.shuttleRun = parseFloat(document.getElementById('shuttleRun').value) || null;
        stepData.balance = parseInt(document.getElementById('balance').value) || null;
    }
    
    // Объединяем с существующими данными
    if (!measurements[0]) {
        measurements[0] = {};
    }
    measurements[0] = { ...measurements[0], ...stepData };
}

function finishMeasurement() {
    saveCurrentStepData();
    
    // Сохраняем замер
    const measurement = {
        ...measurements[0],
        date: new Date().toISOString()
    };
    
    measurements.unshift(measurement);
    saveData();
    
    // Обновляем дашборд и показываем его
    updateDashboard();
    generateTodayTraining();
    showScreen('dashboard');
    
    // Отправляем уведомление в Telegram
    tg.showPopup({
        title: 'Замер завершен!',
        message: 'Твои показатели сохранены. Тренировки готовы!',
        buttons: [{ type: 'ok' }]
    });
}

// Обновление экрана истории
function updateHistoryScreen() {
    const ctx = document.getElementById('history-chart').getContext('2d');
    
    if (historyChart) {
        historyChart.destroy();
    }
    
    const historyData = measurements.slice(0, 10).reverse().map(m => ({
        date: new Date(m.date).toLocaleDateString(),
        ovr: calculateOVR(m).ovr
    }));
    
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: historyData.map(d => d.date),
            datasets: [{
                label: 'OVR',
                data: historyData.map(d => d.ovr),
                borderColor: '#22c55e',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#f1f5f9' } }
            },
            scales: {
                y: { 
                    min: 0, 
                    max: 100,
                    grid: { color: '#334155' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { color: '#334155' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
    
    // Список истории
    let historyHtml = '';
    measurements.slice(0, 5).forEach((m, i) => {
        const ovr = calculateOVR(m).ovr;
        historyHtml += `
            <div class="history-item">
                <span class="history-date">${new Date(m.date).toLocaleDateString()}</span>
                <span class="history-ovr">OVR: ${ovr}</span>
            </div>
        `;
    });
    
    document.getElementById('history-list').innerHTML = historyHtml;
}

// Календарь
let currentDate = new Date();

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('current-month').textContent = 
        currentDate.toLocaleString('ru', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let calendarHtml = '<div class="calendar-weekdays">';
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(day => {
        calendarHtml += `<div>${day}</div>`;
    });
    calendarHtml += '</div><div class="calendar-days">';
    
    // Пустые ячейки до первого дня
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
        calendarHtml += '<div class="calendar-day empty"></div>';
    }
    
    // Дни месяца
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = date.toDateString();
        const hasTraining = trainingPlans[dateStr];
        const isToday = date.toDateString() === today.toDateString();
        
        calendarHtml += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${hasTraining ? 'has-training' : ''}">
                ${day}
                ${hasTraining ? '<span class="training-indicator"></span>' : ''}
            </div>
        `;
    }
    
    calendarHtml += '</div>';
    document.getElementById('calendar-grid').innerHTML = calendarHtml;
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
}

// Профиль
function updateProfileScreen() {
    // Считаем статистику
    document.getElementById('total-workouts').textContent = 
        Object.keys(trainingPlans).length;
    
    const bestOvr = measurements.length > 0 
        ? Math.max(...measurements.map(m => calculateOVR(m).ovr))
        : 0;
    document.getElementById('best-ovr').textContent = bestOvr;
    
    // Считаем streak
    let streak = 0;
    const today = new Date().toDateString();
    if (trainingPlans[today]) streak = 1;
    document.getElementById('streak').textContent = streak;
    
    // Загружаем настройки
    document.getElementById('player-position').value = 
        localStorage.getItem('position') || 'MF';
}

// Сброс данных
function resetData() {
    if (confirm('Точно сбросить все данные?')) {
        measurements = [];
        trainingPlans = {};
        saveData();
        showScreen('measurement');
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    
    // Обработчики кнопок
    document.getElementById('start-training').addEventListener('click', () => {
        tg.showPopup({
            title: 'Тренировка началась!',
            message: 'Удачи! Отмечай выполненные упражнения',
            buttons: [{ type: 'ok' }]
        });
    });
    
    document.getElementById('notifications').addEventListener('change', (e) => {
        if (e.target.checked) {
            tg.HapticFeedback.notificationOccurred('success');
        }
    });
    
    document.getElementById('player-position').addEventListener('change', (e) => {
        localStorage.setItem('position', e.target.value);
        tg.HapticFeedback.impactOccurred('light');
    });
});
