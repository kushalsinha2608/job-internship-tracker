const STORAGE_KEY = "trackr-applications-v1";

const form = document.getElementById("application-form");
const modalBackdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const applicationsBody = document.getElementById("applications-body");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const typeFilter = document.getElementById("type-filter");
const toast = document.getElementById("toast");

let applications = loadApplications();
let toastTimer;

function loadApplications() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveApplications() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
}

function makeId() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function renderStats() {
  document.getElementById("stat-total").textContent = applications.length;
  document.getElementById("stat-applied").textContent = applications.filter(a => a.status === "Applied").length;
  document.getElementById("stat-interview").textContent = applications.filter(a => a.status === "Interview").length;
  document.getElementById("stat-offer").textContent = applications.filter(a => a.status === "Offer").length;
}

function getFilteredApplications() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const type = typeFilter.value;

  return applications
    .filter(app => {
      const matchesSearch = `${app.company} ${app.role} ${app.location || ""}`.toLowerCase().includes(query);
      const matchesStatus = status === "All" || app.status === status;
      const matchesType = type === "All" || app.type === type;
      return matchesSearch && matchesStatus && matchesType;
    })
    .sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || ""));
}

function renderApplications() {
  const filtered = getFilteredApplications();
  applicationsBody.innerHTML = filtered.map(app => {
    const initial = escapeHTML((app.company || "?").trim().charAt(0).toUpperCase());
    const link = app.link
      ? `<a class="small-action" href="${escapeHTML(app.link)}" target="_blank" rel="noopener noreferrer" title="Open application link">↗</a>`
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
        <td><span class="status-pill status-${escapeHTML(app.status)}">${escapeHTML(app.status)}</span></td>
        <td>${escapeHTML(app.location || "—")}</td>
        <td class="action-cell">
          <div class="row-actions">
            ${link}
            <button class="small-action" data-action="edit" data-id="${escapeHTML(app.id)}" title="Edit application" aria-label="Edit ${escapeHTML(app.company)}">✎</button>
            <button class="small-action" data-action="delete" data-id="${escapeHTML(app.id)}" title="Delete application" aria-label="Delete ${escapeHTML(app.company)}">×</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const hasRows = filtered.length > 0;
  emptyState.classList.toggle("visible", !hasRows);
  applicationsBody.closest("table").style.display = hasRows ? "table" : "none";
  document.getElementById("record-count").textContent = `${applications.length} ${applications.length === 1 ? "record" : "records"}`;
  document.getElementById("showing-label").textContent = `Showing ${filtered.length} of ${applications.length} applications`;
  renderStats();
}

function openModal(app = null) {
  form.reset();
  document.getElementById("application-id").value = app?.id || "";
  document.getElementById("company").value = app?.company || "";
  document.getElementById("role").value = app?.role || "";
  document.getElementById("type").value = app?.type || "Internship";
  document.getElementById("status").value = app?.status || "Applied";
  document.getElementById("date-applied").value = app?.dateApplied || new Date().toISOString().slice(0, 10);
  document.getElementById("location").value = app?.location || "";
  document.getElementById("link").value = app?.link || "";
  document.getElementById("notes").value = app?.notes || "";
  modalTitle.textContent = app ? "Edit application" : "Add application";
  document.getElementById("save-btn").textContent = app ? "Update application" : "Save application";
  modalBackdrop.classList.add("open");
  modalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("company").focus(), 50);
}

function closeModal() {
  modalBackdrop.classList.remove("open");
  modalBackdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function handleSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("application-id").value;
  const application = {
    id: id || makeId(),
    company: document.getElementById("company").value.trim(),
    role: document.getElementById("role").value.trim(),
    type: document.getElementById("type").value,
    status: document.getElementById("status").value,
    dateApplied: document.getElementById("date-applied").value,
    location: document.getElementById("location").value.trim(),
    link: document.getElementById("link").value.trim(),
    notes: document.getElementById("notes").value.trim()
  };

  if (!application.company || !application.role) {
    showToast("Please fill in the company and role.");
    return;
  }

  if (id) {
    applications = applications.map(item => item.id === id ? application : item);
    showToast("Application updated.");
  } else {
    applications.push(application);
    showToast("Application added.");
  }

  saveApplications();
  renderApplications();
  closeModal();
}

applicationsBody.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const app = applications.find(item => item.id === button.dataset.id);
  if (!app) return;

  if (button.dataset.action === "edit") {
    openModal(app);
  } else if (button.dataset.action === "delete") {
    if (confirm(`Delete the application at ${app.company}? This cannot be undone.`)) {
      applications = applications.filter(item => item.id !== app.id);
      saveApplications();
      renderApplications();
      showToast("Application deleted.");
    }
  }
});

document.getElementById("open-add-modal").addEventListener("click", () => openModal());
document.getElementById("empty-add-btn").addEventListener("click", () => openModal());
document.getElementById("close-modal").addEventListener("click", closeModal);
document.getElementById("cancel-modal").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", event => {
  if (event.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && modalBackdrop.classList.contains("open")) closeModal();
});
form.addEventListener("submit", handleSubmit);
searchInput.addEventListener("input", renderApplications);
statusFilter.addEventListener("change", renderApplications);
typeFilter.addEventListener("change", renderApplications);
document.getElementById("clear-filters").addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "All";
  typeFilter.value = "All";
  renderApplications();
});

document.getElementById("today-label").textContent =
  new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();

renderApplications();
