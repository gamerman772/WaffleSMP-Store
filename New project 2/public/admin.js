import { detectBackend, requestApi } from "./backend.js";

const adminState = {
  token: localStorage.getItem("waffle_admin_token") || "",
  dashboard: null,
  backendMode: "remote",
  sharedBackendReady: true
};

const adminCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

async function adminFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (adminState.token) {
    headers.Authorization = `Bearer ${adminState.token}`;
  }
  return requestApi(adminState.backendMode, url, { ...options, headers });
}

function adminAvailable() {
  return adminState.backendMode === "remote" && adminState.sharedBackendReady;
}

function updateAdminStatus() {
  const banner = document.getElementById("admin-status-banner");
  const loginButton = document.querySelector('#admin-login-form button[type="submit"]');

  if (adminAvailable()) {
    banner.classList.add("hidden");
    banner.textContent = "";
    loginButton.disabled = false;
    loginButton.classList.remove("button-disabled");
    return;
  }

  banner.classList.remove("hidden");
  banner.textContent =
    "Admin tools are disabled until the live backend is working. Browser-only fallback is not used for real orders.";
  loginButton.disabled = true;
  loginButton.classList.add("button-disabled");
}

function setAdminMessage(message, isError = false) {
  const target = document.getElementById("admin-login-message");
  target.textContent = message;
  target.style.color = isError ? "#ab2a1f" : "#20755a";
}

function renderDashboard() {
  const shell = document.getElementById("dashboard-shell");
  if (!adminState.dashboard) {
    shell.classList.add("hidden");
    return;
  }

  shell.classList.remove("hidden");
  const { stats, gemOrders, rankOrders, accounts } = adminState.dashboard;

  document.getElementById("stats-grid").innerHTML = `
    <article class="stat-card"><p class="mini-label">Revenue</p><h3>${adminCurrency.format(stats.totalRevenueUsd)}</h3></article>
    <article class="stat-card"><p class="mini-label">Accounts</p><h3>${stats.totalAccounts}</h3></article>
    <article class="stat-card"><p class="mini-label">Pending gems</p><h3>${stats.pendingGemOrders}</h3></article>
    <article class="stat-card"><p class="mini-label">Pending ranks</p><h3>${stats.pendingRankOrders}</h3></article>
  `;

  document.getElementById("gem-orders-list").innerHTML =
    gemOrders.length === 0
      ? "No gem orders yet."
      : gemOrders
          .slice()
          .reverse()
          .map(
            (order) => `
              <article class="data-card">
                <div class="data-row"><strong>${order.accountUsername}</strong><span>${adminCurrency.format(order.amountUsd)}</span></div>
                <div class="data-row"><span>${order.email || ""}</span><span>${order.gems} gems</span></div>
                <div class="data-row">
                  <span class="status-pill ${order.status === "approved" ? "status-approved" : "status-pending"}">${order.status}</span>
                  ${
                    order.status === "pending"
                      ? `<button class="primary-button small" data-approve-gem="${order.id}">Approve payment</button>`
                      : `<span>${new Date(order.approvedAt).toLocaleString()}</span>`
                  }
                </div>
              </article>
            `
          )
          .join("");

  document.getElementById("rank-orders-list").innerHTML =
    rankOrders.length === 0
      ? "No rank orders yet."
      : rankOrders
          .slice()
          .reverse()
          .map(
            (order) => `
              <article class="data-card">
                <div class="data-row"><strong>${order.rankName}</strong><span>${order.gemCost} gems</span></div>
                <div class="data-row"><span>${order.accountUsername}</span><span>${order.minecraftUsername} · ${order.edition}</span></div>
                <div class="data-row">
                  <span class="status-pill ${order.status === "approved" ? "status-approved" : "status-pending"}">${order.status}</span>
                  ${
                    order.status === "pending"
                      ? `<button class="primary-button small" data-approve-rank="${order.id}">Approve rank</button>`
                      : `<span>${new Date(order.approvedAt).toLocaleString()}</span>`
                  }
                </div>
              </article>
            `
          )
          .join("");

  document.getElementById("accounts-list").innerHTML =
    accounts.length === 0
      ? "No accounts yet."
      : accounts
          .slice()
          .reverse()
          .map(
            (account) => `
              <article class="data-card">
                <div class="data-row"><strong>${account.username}</strong><span>${account.gemsBalance} gems</span></div>
                <div class="data-row"><span>${account.email}</span><span>${new Date(account.createdAt).toLocaleString()}</span></div>
              </article>
            `
          )
          .join("");

  document.querySelectorAll("[data-approve-gem]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await adminFetch("/api/admin/gem-orders/approve", {
          method: "POST",
          body: JSON.stringify({ orderId: button.getAttribute("data-approve-gem") })
        });
        adminState.dashboard = result.dashboard;
        renderDashboard();
      } catch (error) {
        setAdminMessage(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-approve-rank]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await adminFetch("/api/admin/rank-orders/approve", {
          method: "POST",
          body: JSON.stringify({ orderId: button.getAttribute("data-approve-rank") })
        });
        adminState.dashboard = result.dashboard;
        renderDashboard();
      } catch (error) {
        setAdminMessage(error.message, true);
      }
    });
  });
}

async function loadDashboard() {
  if (!adminState.token) {
    return;
  }
  try {
    adminState.dashboard = await adminFetch("/api/admin/dashboard", { method: "GET" });
    renderDashboard();
  } catch {
    localStorage.removeItem("waffle_admin_token");
    adminState.token = "";
    adminState.dashboard = null;
    renderDashboard();
  }
}

function setupAdmin() {
  document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!adminAvailable()) {
      setAdminMessage("Admin backend is temporarily offline right now.", true);
      return;
    }
    try {
      const result = await adminFetch("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });
      adminState.token = result.token;
      localStorage.setItem("waffle_admin_token", result.token);
      setAdminMessage("Admin login successful.");
      await loadDashboard();
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });

  document.getElementById("refresh-dashboard-top").addEventListener("click", loadDashboard);
}

async function init() {
  const backend = await detectBackend();
  adminState.backendMode = backend.mode;
  adminState.sharedBackendReady = backend.shared;
  setupAdmin();
  updateAdminStatus();
  await loadDashboard();
}

init();
