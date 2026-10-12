const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = "focusflow.tasks.v1";
const today = new Date();
const localDate = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const todayString = localDate(today);
let tasks = [];
let currentFilter = "all";
let editingId = null;
let toastTimeout;
let timerInterval = null;
let secondsLeft = 25 * 60;
let timerRunning = false;

const seedTasks = [
  { id: "seed-1", title: "Polish portfolio homepage", description: "Review spacing, typography and mobile responsiveness.", category: "Design", priority: "high", due: todayString, completed: false, created: Date.now() - 5000, completedAt: null },
  { id: "seed-2", title: "Practice JavaScript DOM events", description: "Build confidence with event listeners and form validation.", category: "Learning", priority: "medium", due: todayString, completed: false, created: Date.now() - 4000, completedAt: null },
  { id: "seed-3", title: "Push latest project to GitHub", description: "Add a clear README and share the live preview.", category: "Development", priority: "low", due: todayString, completed: true, created: Date.now() - 3000, completedAt: Date.now() - 1000 },
  { id: "seed-4", title: "Explore a new UI inspiration", description: "Collect ideas for the next frontend project.", category: "Design", priority: "medium", due: "", completed: false, created: Date.now() - 2000, completedAt: null }
];

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    tasks = saved ? JSON.parse(saved) : seedTasks;
    if (!Array.isArray(tasks)) tasks = seedTasks;
  } catch {
    tasks = seedTasks;
  }
  saveTasks();
}
function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (error) { console.warn("Tasks could not be saved in this browser.", error); }
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function formatDue(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (value === todayString) return "Today";
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (value === localDate(tomorrow)) return "Tomorrow";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function getVisibleTasks() {
  const query = $("#searchInput").value.trim().toLowerCase();
  return tasks.filter(task => {
    const filterMatch = currentFilter === "all" || (currentFilter === "today" && task.due === todayString && !task.completed) || (currentFilter === "completed" && task.completed);
    const queryMatch = `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(query);
    return filterMatch && queryMatch;
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) || (a.created || 0) - (b.created || 0));
}
function renderTasks() {
  const visible = getVisibleTasks();
  $("#taskList").innerHTML = visible.map((task, index) => `
    <article class="task-row ${task.completed ? "done" : ""}" style="animation-delay:${Math.min(index * 35, 210)}ms">
      <input class="task-check" type="checkbox" data-complete="${escapeHTML(task.id)}" ${task.completed ? "checked" : ""} aria-label="Mark ${escapeHTML(task.title)} complete">
      <div class="task-main"><p class="task-title">${escapeHTML(task.title)}</p>${task.description ? `<p class="task-description">${escapeHTML(task.description)}</p>` : ""}
        <div class="task-meta"><span class="category-pill">${escapeHTML(task.category)}</span><span class="priority-pill priority-${escapeHTML(task.priority)}">${task.priority[0].toUpperCase() + task.priority.slice(1)} priority</span>${task.due ? `<span class="due-pill">◷ ${escapeHTML(formatDue(task.due))}</span>` : ""}</div>
      </div>
      <div class="task-actions"><button class="icon-button" data-edit="${escapeHTML(task.id)}" aria-label="Edit task">✎</button><button class="icon-button" data-delete="${escapeHTML(task.id)}" aria-label="Delete task">×</button></div>
    </article>`).join("");
  $("#emptyState").hidden = visible.length > 0;
  $("#taskList").hidden = visible.length === 0;
  $("#taskFooter").textContent = `${visible.length} ${visible.length === 1 ? "task" : "tasks"} shown`;
  $("#allCount").textContent = tasks.filter(t => !t.completed).length;
  $("#todayCount").textContent = tasks.filter(t => t.due === todayString && !t.completed).length;
  const heading = currentFilter === "today" ? "Today's tasks" : currentFilter === "completed" ? "Completed tasks" : "Your tasks";
  $("#taskHeading").textContent = heading;
  $$(".nav-link").forEach(btn => btn.classList.toggle("active", btn.dataset.filter === currentFilter));
  $$(".filter-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.filter === currentFilter));
  renderStats();
  renderWeekChart();
}
function renderStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const inProgress = total - completed;
  const percent = total ? Math.round(completed / total * 100) : 0;
  $("#totalStat").textContent = total;
  $("#completedStat").textContent = completed;
  $("#progressStat").textContent = inProgress;
  $("#progressPercent").textContent = `${percent}%`;
  $("#totalLine").style.width = `${total ? 100 : 0}%`;
  $("#completedLine").style.width = `${total ? completed / total * 100 : 0}%`;
  $("#progressLine").style.width = `${total ? inProgress / total * 100 : 0}%`;
  $("#dailyLine").style.width = `${percent}%`;
  $("#miniRing").style.borderColor = `conic-gradient(var(--blue) ${percent}%, var(--blue-soft) 0)`;
  $("#miniRing").style.background = `conic-gradient(var(--blue) ${percent}%, var(--blue-soft) 0)`;
  $("#miniRing").style.color = "white";
}
function renderWeekChart() {
  const days = [];
  const start = new Date(today);
  start.setDate(today.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const key = localDate(day);
    const count = tasks.filter(t => t.completed && t.completedAt && localDate(new Date(t.completedAt)) === key).length;
    days.push({ key, label: day.toLocaleDateString(undefined, { weekday: "short" }), count, isToday: key === todayString });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  $("#weekChart").innerHTML = days.map(d => `<div class="chart-day ${d.isToday ? "today" : ""}" title="${d.count} completed"><div class="chart-bar-track"><div class="chart-bar" style="height:${d.count ? Math.max(10, d.count / max * 100) : 3}%"></div></div><span>${d.label}</span></div>`).join("");
  const total = days.reduce((sum, d) => sum + d.count, 0);
  $("#weekTotal").textContent = `${total} this week`;
}
function showToast(message) {
  $("#toastMessage").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}
function openTaskModal(task = null) {
  editingId = task?.id ?? null;
  $("#taskForm").reset();
  $("#modalTitle").textContent = task ? "Edit your task" : "Add a new task";
  $("#saveTask").innerHTML = task ? 'Save changes <span>→</span>' : 'Create task <span>→</span>';
  $("#taskTitle").value = task?.title ?? "";
  $("#taskDescription").value = task?.description ?? "";
  $("#taskCategory").value = task?.category ?? "Development";
  $("#taskPriority").value = task?.priority ?? "medium";
  $("#taskDue").value = task?.due ?? todayString;
  $("#taskModal").classList.add("open");
  $("#taskModal").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#taskTitle").focus(), 80);
}
function closeTaskModal() {
  $("#taskModal").classList.remove("open");
  $("#taskModal").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  editingId = null;
}
function addOrUpdateTask(event) {
  event.preventDefault();
  const title = $("#taskTitle").value.trim();
  if (!title) return;
  const data = { title, description: $("#taskDescription").value.trim(), category: $("#taskCategory").value, priority: $("#taskPriority").value, due: $("#taskDue").value };
  if (editingId) {
    tasks = tasks.map(task => task.id === editingId ? { ...task, ...data } : task);
    showToast("Task updated successfully");
  } else {
    tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), ...data, completed: false, created: Date.now(), completedAt: null });
    showToast("Your new task is ready");
  }
  saveTasks(); closeTaskModal(); currentFilter = "all"; renderTasks();
}
function setFilter(filter) {
  currentFilter = filter;
  $$(".filter-tab, .nav-link").forEach(btn => btn.classList.toggle("active", btn.dataset.filter === filter));
  renderTasks();
}
function toggleComplete(id, completed) {
  tasks = tasks.map(task => task.id === id ? { ...task, completed, completedAt: completed ? Date.now() : null } : task);
  saveTasks(); renderTasks(); showToast(completed ? "Nice work! Task completed" : "Task moved back to in progress");
}
function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks(); renderTasks(); showToast("Task deleted");
}
function openFocus() {
  $("#focusOverlay").classList.add("open");
  $("#focusOverlay").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeFocus() {
  $("#focusOverlay").classList.remove("open");
  $("#focusOverlay").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function updateTimer() {
  const min = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const sec = String(secondsLeft % 60).padStart(2, "0");
  $("#timerDisplay").textContent = `${min}:${sec}`;
  document.title = timerRunning ? `${min}:${sec} — FocusFlow` : "FocusFlow — Make space for deep work";
}
function resetTimer() {
  clearInterval(timerInterval); timerInterval = null; timerRunning = false; secondsLeft = 25 * 60;
  $("#timerStart").textContent = "Start timer"; updateTimer();
}
function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval); timerInterval = null; timerRunning = false; $("#timerStart").textContent = "Resume timer";
  } else {
    timerRunning = true; $("#timerStart").textContent = "Pause timer";
    timerInterval = setInterval(() => {
      secondsLeft--; updateTimer();
      if (secondsLeft <= 0) { resetTimer(); showToast("Focus session complete — take a short break!"); }
    }, 1000);
  }
}
function init() {
  loadTasks();
  $("#dateChip").textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  renderTasks();
  $("#addTaskTop").addEventListener("click", () => openTaskModal());
  $("#emptyAdd").addEventListener("click", () => openTaskModal());
  $("#closeModal").addEventListener("click", closeTaskModal);
  $("#taskModal").addEventListener("click", event => { if (event.target === $("#taskModal")) closeTaskModal(); });
  $("#taskForm").addEventListener("submit", addOrUpdateTask);
  $("#searchInput").addEventListener("input", renderTasks);
  $$(".filter-tab, .nav-link").forEach(btn => btn.addEventListener("click", () => setFilter(btn.dataset.filter)));
  $("#taskList").addEventListener("change", event => {
    const checkbox = event.target.closest("[data-complete]");
    if (checkbox) toggleComplete(checkbox.dataset.complete, checkbox.checked);
  });
  $("#taskList").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    if (edit) openTaskModal(tasks.find(t => t.id === edit.dataset.edit));
    if (del) deleteTask(del.dataset.delete);
  });
  $("#clearCompleted").addEventListener("click", () => {
    const count = tasks.filter(t => t.completed).length;
    if (!count) { showToast("No completed tasks to clear"); return; }
    tasks = tasks.filter(t => !t.completed); saveTasks(); renderTasks(); showToast(`${count} completed ${count === 1 ? "task" : "tasks"} cleared`);
  });
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    $("#themeToggle").textContent = dark ? "☾" : "☼";
    try { localStorage.setItem("focusflow.theme", dark ? "dark" : "light"); } catch {}
  });
  try { if (localStorage.getItem("focusflow.theme") === "dark") { document.body.classList.add("dark"); $("#themeToggle").textContent = "☾"; } } catch {}
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $$(".nav-link").forEach(btn => btn.addEventListener("click", () => $("#sidebar").classList.remove("open")));
  $("#focusBtn").addEventListener("click", openFocus);
  $("#closeFocus").addEventListener("click", closeFocus);
  $("#focusOverlay").addEventListener("click", event => { if (event.target === $("#focusOverlay")) closeFocus(); });
  $("#timerStart").addEventListener("click", toggleTimer);
  $("#timerReset").addEventListener("click", resetTimer);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeTaskModal(); closeFocus(); $("#sidebar").classList.remove("open"); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#searchInput").focus(); }
  });
}
init();