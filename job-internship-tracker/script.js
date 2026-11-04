
// ==========================================
// TRACKR - JOB & INTERNSHIP TRACKER
// Firebase Authentication + Cloud Firestore
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// REPLACE THESE VALUES WITH YOUR OWN
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyAcPiGs6IK2uhgtyApNqgtHPjoFWoGXwdQ",
  authDomain: "trackr-7bcfb.firebaseapp.com",
  projectId: "trackr-7bcfb",
  storageBucket: "trackr-7bcfb.firebasestorage.app",
  messagingSenderId: "542171380436",
  appId: "1:542171380436:web:9275747931c21821615941",
  measurementId: "G-SDVS7MWCQY"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ==========================================
// 2. GLOBAL VARIABLES
// ==========================================

let currentUser = null;
let applications = [];
let unsubscribeApplications = null;
let statusChart = null;
let typeChart = null;
let toastTimer = null;
let reminderTimer = null;

const $ = id => document.getElementById(id);

const form = $("application-form");
const modalBackdrop = $("modal-backdrop");
const applicationsBody = $("applications-body");
const emptyState = $("empty-state");
const searchInput = $("search-input");
const statusFilter = $("status-filter");
const typeFilter = $("type-filter");
const toast = $("toast");

// ==========================================
// 3. UTILITY FUNCTIONS
// ==========================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function getUserCollection() {
  if (!currentUser) throw new Error("Please log in first.");

  return collection(db, "users", currentUser.uid, "applications");
}

function validGmail(email) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email.trim());
}

// ==========================================
// 4. AUTHENTICATION
// ==========================================

async function initializeAuthentication() {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (error) {
    showToast(error.message);
  }
}

$("show-signup").addEventListener("click", () => {
  $("login-panel").classList.add("hidden");
  $("signup-panel").classList.remove("hidden");
});

$("show-login").addEventListener("click", () => {
  $("signup-panel").classList.add("hidden");
  $("login-panel").classList.remove("hidden");
});

$("signup-form").addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim().toLowerCase();
  const password = $("signup-password").value;
  const confirmPassword = $("confirm-password").value;
  updateUserProfile();
  if (!validGmail(email)) {
    showToast("Please enter a valid Gmail address.");
    return;
  }

  if (password.length < 8) {
    showToast("Password must contain at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match.");
    return;
  }

  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await updateProfile(result.user, {
      displayName: name
    });

    showToast("Account created successfully!");

    $("signup-form").reset();

  } catch (error) {
    showToast(error.message);
  }
});

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("login-email").value.trim().toLowerCase();
  const password = $("login-password").value;

  if (!validGmail(email)) {
    showToast("Please enter a valid Gmail address.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    $("login-form").reset();
    showToast("Login successful!");
  } catch (error) {
    showToast("Login failed: " + error.message);
  }
});

$("forgot-password").addEventListener("click", async () => {
  const email = $("login-email").value.trim().toLowerCase();

  if (!validGmail(email)) {
    showToast("Enter your Gmail address first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset email sent.");
  } catch (error) {
    showToast(error.message);
  }
});

$("logout-btn").addEventListener("click", async () => {
  try {
    if (unsubscribeApplications) {
      unsubscribeApplications();
      unsubscribeApplications = null;
    }

    await signOut(auth);
    applications = [];
    showToast("Logged out successfully.");
  } catch (error) {
    showToast(error.message);
  }
});

// ==========================================
// 5. AUTH STATE AND USER PROFILE
// ==========================================

onAuthStateChanged(auth, user => {
  currentUser = user;

  if (user) {
    $("auth-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");

    updateUserProfile();
    startApplicationListener();
    checkReminders();

    clearInterval(reminderTimer);
    reminderTimer = setInterval(checkReminders, 60000);

  } else {
    if (unsubscribeApplications) {
      unsubscribeApplications();
      unsubscribeApplications = null;
    }

    clearInterval(reminderTimer);

    applications = [];

    $("app-shell").classList.add("hidden");
    $("auth-screen").classList.remove("hidden");

    $("login-panel").classList.remove("hidden");
    $("signup-panel").classList.add("hidden");
  }
});

function updateUserProfile() {
  if (!currentUser) return;

  const name = currentUser.displayName || "Trackr User";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  $("profile-name").textContent = name;
  $("profile-email").textContent = currentUser.email;
  $("profile-avatar").textContent = initials || "KS";
}

$("edit-profile").addEventListener("click", async () => {
  if (!currentUser) return;

  const newName = prompt(
    "Enter your display name:",
    currentUser.displayName || ""
  );

  if (newName === null) return;

  if (!newName.trim()) {
    showToast("Name cannot be empty.");
    return;
  }

  try {
    await updateProfile(currentUser, {
      displayName: newName.trim()
    });

    updateUserProfile();
    showToast("Profile updated.");
  } catch (error) {
    showToast(error.message);
  }
});

// ==========================================
// 6. CLOUD DATABASE
// ==========================================

function startApplicationListener() {
  if (unsubscribeApplications) {
    unsubscribeApplications();
  }

  try {
    unsubscribeApplications = onSnapshot(
      getUserCollection(),

      snapshot => {
        applications = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data()
        }));

        renderAll();
      },

      error => showToast("Database error: " + error.message)
    );
  } catch (error) {
    showToast(error.message);
  }
}

async function saveApplication(application) {
  try {
    await setDoc(
      doc(db, "users", currentUser.uid, "applications", application.id),
      application
    );

    showToast("Application saved successfully.");
  } catch (error) {
    showToast("Could not save: " + error.message);
  }
}

async function removeApplication(id) {
  try {
    await deleteDoc(
      doc(db, "users", currentUser.uid, "applications", id)
    );

    showToast("Application deleted.");
  } catch (error) {
    showToast(error.message);
  }
}

// ==========================================
// 7. APPLICATION FORM
// ==========================================

function openModal(app = null) {
  form.reset();

  $("application-id").value = app?.id || "";
  $("company").value = app?.company || "";
  $("role").value = app?.role || "";
  $("type").value = app?.type || "Internship";
  $("status").value = app?.status || "Applied";
  $("date-applied").value = app?.dateApplied || todayString();
  $("follow-up-date").value = app?.followUpDate || "";
  $("location").value = app?.location || "";
  $("link").value = app?.link || "";
  $("notes").value = app?.notes || "";

  $("modal-title").textContent = app
    ? "Edit application"
    : "Add application";

  $("save-btn").textContent = app
    ? "Update application"
    : "Save application";

  modalBackdrop.classList.add("open");
}

function closeModal() {
  modalBackdrop.classList.remove("open");
}

$("open-add-modal").addEventListener("click", () => openModal());
$("empty-add-btn").addEventListener("click", () => openModal());
$("close-modal").addEventListener("click", closeModal);
$("cancel-modal").addEventListener("click", closeModal);

modalBackdrop.addEventListener("click", event => {
  if (event.target === modalBackdrop) closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  const id = $("application-id").value;

  const application = {
    id: id || makeId(),
    company: $("company").value.trim(),
    role: $("role").value.trim(),
    type: $("type").value,
    status: $("status").value,
    dateApplied: $("date-applied").value,
    followUpDate: $("follow-up-date").value,
    location: $("location").value.trim(),
    link: $("link").value.trim(),
    notes: $("notes").value.trim(),
    updatedAt: new Date().toISOString()
  };

  if (!application.company || !application.role) {
    showToast("Enter company name and job role.");
    return;
  }

  if (application.link &&
      !/^https?:\/\//i.test(application.link)) {
    showToast("Application link must start with http:// or https://");
    return;
  }

  await saveApplication(application);
  closeModal();
});

// ==========================================
// 8. RENDER APPLICATIONS
// ==========================================

function getFilteredApplications() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const type = typeFilter.value;

  return applications
    .filter(app => {
      const searchable = [
        app.company,
        app.role,
        app.location,
        app.notes
      ].join(" ").toLowerCase();

      const matchesSearch = searchable.includes(query);
      const matchesStatus = status === "All" || app.status === status;
      const matchesType = type === "All" || app.type === type;

      return matchesSearch && matchesStatus && matchesType;
    })
    .sort((a, b) =>
      (b.dateApplied || "").localeCompare(a.dateApplied || "")
    );
}

function renderApplications() {
  const filtered = getFilteredApplications();

  applicationsBody.innerHTML = filtered.map(app => {
    const initial = escapeHTML(
      (app.company || "?").trim().charAt(0).toUpperCase()
    );

    const link = app.link &&
      /^https?:\/\//i.test(app.link)
      ? `<a class="small-action" href="${escapeHTML(app.link)}" target="_blank" rel="noopener noreferrer">↗</a>`
      : "";

    return `
      <tr>
        <td>
          <div class="company-cell">
            <div class="company-logo">${initial}</div>
            <div>
              <span class="company-name">${escapeHTML(app.company)}</span>
              <span class="role-name">${escapeHTML(app.role)}</span>
            </div>
          </div>
        </td>
        <td>${escapeHTML(app.type)}</td>
        <td>${formatDate(app.dateApplied)}</td>
        <td>${formatDate(app.followUpDate)}</td>
        <td>
          <span class="status-pill status-${escapeHTML(app.status)}">
            ${escapeHTML(app.status)}
          </span>
        </td>
        <td>${escapeHTML(app.location || "—")}</td>
        <td>
          ${link}
          <button class="small-action" data-action="edit" data-id="${escapeHTML(app.id)}">✎</button>
          <button class="small-action" data-action="delete" data-id="${escapeHTML(app.id)}">×</button>
        </td>
      </tr>
    `;
  }).join("");

  const hasRows = filtered.length > 0;

  emptyState.classList.toggle("visible", !hasRows);
  applicationsBody.closest("table").style.display =
    hasRows ? "table" : "none";

  $("record-count").textContent =
    `${applications.length} ${applications.length === 1 ? "record" : "records"}`;

  $("showing-label").textContent =
    `Showing ${filtered.length} of ${applications.length} applications`;

  renderStats();
}

applicationsBody.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const app = applications.find(item => item.id === button.dataset.id);
  if (!app) return;

  if (button.dataset.action === "edit") {
    openModal(app);
  }

  if (button.dataset.action === "delete") {
    if (confirm(`Delete the application at ${app.company}?`)) {
      await removeApplication(app.id);
    }
  }
});

searchInput.addEventListener("input", renderApplications);
statusFilter.addEventListener("change", renderApplications);
typeFilter.addEventListener("change", renderApplications);

$("clear-filters").addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "All";
  typeFilter.value = "All";
  renderApplications();
});

// ==========================================
// 9. DASHBOARD STATISTICS
// ==========================================

function renderStats() {
  const count = status =>
    applications.filter(app => app.status === status).length;

  $("stat-total").textContent = applications.length;
  $("stat-applied").textContent = count("Applied");
  $("stat-interview").textContent = count("Interview");
  $("stat-offer").textContent = count("Offer");

  renderCharts();
}

// ==========================================
// 10. DASHBOARD CHARTS
// ==========================================

function renderCharts() {
  if (typeof Chart === "undefined") return;

  const statuses = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];
  const types = ["Internship", "Full-time", "Part-time", "Freelance"];

  const statusCounts = statuses.map(status =>
    applications.filter(app => app.status === status).length
  );

  const typeCounts = types.map(type =>
    applications.filter(app => app.type === type).length
  );

  const statusCanvas = $("status-chart");
  const typeCanvas = $("type-chart");

  if (statusChart) statusChart.destroy();
  if (typeChart) typeChart.destroy();

  statusChart = new Chart(statusCanvas, {
    type: "doughnut",
    data: {
      labels: statuses,
      datasets: [{
        data: statusCounts,
        backgroundColor: [
          "#a5a7b3",
          "#4389db",
          "#8868d9",
          "#15966b",
          "#cf6262"
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });

  typeChart = new Chart(typeCanvas, {
    type: "bar",
    data: {
      labels: types,
      datasets: [{
        label: "Applications",
        data: typeCounts,
        backgroundColor: "#6958e8",
        borderRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

// ==========================================
// 11. FOLLOW-UP REMINDERS
// ==========================================

function checkReminders() {
  const today = todayString();

  const upcoming = applications
    .filter(app =>
      app.followUpDate &&
      app.followUpDate >= today &&
      app.status !== "Offer" &&
      app.status !== "Rejected"
    )
    .sort((a, b) =>
      a.followUpDate.localeCompare(b.followUpDate)
    );

  const overdue = applications.filter(app =>
    app.followUpDate &&
    app.followUpDate < today &&
    app.status !== "Offer" &&
    app.status !== "Rejected"
  );

  const allReminders = [...overdue, ...upcoming];

  if (!allReminders.length) {
    $("reminder-list").innerHTML =
      '<p class="muted">No upcoming reminders. Add a follow-up date to an application.</p>';
    return;
  }

  $("reminder-list").innerHTML = allReminders.map(app => {
    const isOverdue = app.followUpDate < today;

    return `
      <div class="reminder-item">
        <div>
          <strong>${escapeHTML(app.company)} — ${escapeHTML(app.role)}</strong>
          <small>${isOverdue ? "Overdue follow-up" : "Upcoming follow-up"}</small>
        </div>
        <span class="reminder-date">
          ${formatDate(app.followUpDate)}
        </span>
      </div>
    `;
  }).join("");

  // Notifications are only sent while the app is open.
  if ("Notification" in window &&
      Notification.permission === "granted") {
    const notified = JSON.parse(
      sessionStorage.getItem("trackr-notified") || "[]"
    );

    allReminders.forEach(app => {
      if (app.followUpDate !== today || notified.includes(app.id)) return;

      new Notification("Trackr follow-up reminder", {
        body: `Follow up with ${app.company} about ${app.role}.`
      });

      notified.push(app.id);
    });

    sessionStorage.setItem(
      "trackr-notified",
      JSON.stringify(notified)
    );
  }
}

$("enable-notifications").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showToast("Notifications are not supported in this browser.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    showToast("Notifications enabled!");
    checkReminders();
  } else {
    showToast("Notification permission was not granted.");
  }
});

// ==========================================
// 12. EXPORT APPLICATIONS TO CSV
// ==========================================

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

$("export-csv").addEventListener("click", () => {
  if (!applications.length) {
    showToast("No applications to export.");
    return;
  }

  const headers = [
    "Company",
    "Role",
    "Type",
    "Status",
    "Date Applied",
    "Follow-up Date",
    "Location",
    "Link",
    "Notes"
  ];

  const rows = applications.map(app => [
    app.company,
    app.role,
    app.type,
    app.status,
    app.dateApplied,
    app.followUpDate,
    app.location,
    app.link,
    app.notes
  ]);

  const csv = [
    headers,
    ...rows
  ].map(row => row.map(csvEscape).join(",")).join("\r\n");

  downloadFile(
    "\uFEFF" + csv,
    "trackr-applications.csv",
    "text/csv;charset=utf-8"
  );

  showToast("CSV downloaded.");
});

// ==========================================
// 13. JSON BACKUP AND RESTORE
// ==========================================

$("export-json").addEventListener("click", () => {
  const backup = {
    app: "Trackr",
    version: 1,
    exportedAt: new Date().toISOString(),
    applications
  };

  downloadFile(
    JSON.stringify(backup, null, 2),
    "trackr-backup.json",
    "application/json"
  );

  showToast("Backup downloaded.");
});

$("import-json-btn").addEventListener("click", () => {
  $("import-json").click();
});

$("import-json").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());

    if (!Array.isArray(backup.applications)) {
      throw new Error("Invalid Trackr backup file.");
    }

    const validStatuses = [
      "Wishlist", "Applied", "Interview", "Offer", "Rejected"
    ];

    const validTypes = [
      "Internship", "Full-time", "Part-time", "Freelance"
    ];

    const records = backup.applications;

    if (records.length > 400) {
      throw new Error("Backup contains too many records.");
    }

    const validRecords = records.map(app => {
      if (!app.company || !app.role ||
          !validStatuses.includes(app.status) ||
          !validTypes.includes(app.type)) {
        throw new Error("Backup contains an invalid application.");
      }

      return {
        id: String(app.id || makeId()),
        company: String(app.company).slice(0, 70),
        role: String(app.role).slice(0, 90),
        type: app.type,
        status: app.status,
        dateApplied: String(app.dateApplied || ""),
        followUpDate: String(app.followUpDate || ""),
        location: String(app.location || "").slice(0, 70),
        link: String(app.link || ""),
        notes: String(app.notes || "").slice(0, 500)
      };
    });

    if (!confirm(
      `Import ${validRecords.length} records? Existing records with matching IDs will be replaced.`
    )) {
      event.target.value = "";
      return;
    }

    const batch = writeBatch(db);

    validRecords.forEach(app => {
      const ref = doc(
        db,
        "users",
        currentUser.uid,
        "applications",
        app.id
      );

      batch.set(ref, app);
    });

    await batch.commit();

    showToast("Backup imported successfully.");

  } catch (error) {
    showToast(error.message || "Could not import backup.");
  }

  event.target.value = "";
});

// ==========================================
// 14. DARK MODE
// ==========================================

const savedTheme = localStorage.getItem("trackr-theme");

if (savedTheme === "dark") {
  document.body.classList.add("dark");
}

function updateThemeButton() {
  $("theme-toggle").textContent =
    document.body.classList.contains("dark")
      ? "☀️ Light mode"
      : "🌙 Dark mode";
}

updateThemeButton();

$("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");

  const theme = document.body.classList.contains("dark")
    ? "dark"
    : "light";

  localStorage.setItem("trackr-theme", theme);

  updateThemeButton();
});

// ==========================================
// 15. NAVIGATION AND INITIALIZATION
// ==========================================

document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(item =>
      item.classList.remove("active")
    );

    link.classList.add("active");
  });
});

$("today-label").textContent = new Date().toLocaleDateString(
  "en-IN",
  {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }
).toUpperCase();

function renderAll() {
  renderApplications();
  checkReminders();
}

initializeAuthentication();
