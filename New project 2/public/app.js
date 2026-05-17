import { detectBackend, requestApi } from "./backend.js";

const state = {
  config: null,
  account: null,
  gemOrders: [],
  rankOrders: [],
  token: localStorage.getItem("waffle_token") || "",
  selectedRank: null,
  backendMode: "remote",
  sharedBackendReady: true
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  return requestApi(state.backendMode, url, { ...options, headers });
}

function storeAvailable() {
  return state.backendMode === "remote" && state.sharedBackendReady;
}

function updateStoreStatus() {
  const banner = document.getElementById("store-status-banner");
  const buyButtons = [
    document.getElementById("open-gem-order"),
    document.getElementById("hero-buy-gems"),
    document.getElementById("account-buy-gems")
  ];

  if (storeAvailable()) {
    banner.classList.add("hidden");
    banner.textContent = "";
    buyButtons.forEach((button) => {
      button.disabled = false;
      button.classList.remove("button-disabled");
    });
    return;
  }

  banner.classList.remove("hidden");
  banner.textContent =
    "Store checkout is temporarily offline. To buy, send an email to drdonutiskool@gmail.com with the name of the rank you want.";
  buyButtons.forEach((button) => {
    button.disabled = true;
    button.classList.add("button-disabled");
  });
}

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function setMessage(id, message, isError = false) {
  const target = document.getElementById(id);
  target.textContent = message;
  target.style.color = isError ? "#ab2a1f" : "#20755a";
}

function renderRanks() {
  const container = document.getElementById("rank-grid");
  container.innerHTML = "";

  state.config.ranks.forEach((rank) => {
    const card = document.createElement("article");
    card.className = "card rank-card";

    const features = [
      `${rank.homes} homes`,
      `${rank.marketSlots} market slots`,
      rank.priorityQueue ? "Priority queue" : "Standard queue access",
      rank.shopCashMultiplier > 1 ? `Shop cash ${rank.shopCashMultiplier}x` : "Standard shop cash"
    ];

    const freeLabel = rank.id === "member" ? "Included automatically" : `${rank.gemCost} gems`;
    const costLabel = rank.priceUsd === 0 ? "$0" : currency.format(rank.priceUsd);

    card.innerHTML = `
      <p class="eyebrow">${rank.name}</p>
      <div class="price-tag">${costLabel}</div>
      <p class="mini-label">${freeLabel}</p>
      <div class="status-pill ${rank.id === "member" ? "status-approved" : "status-pending"}">${
        rank.id === "member" ? "Baseline rank" : "Gem checkout"
      }</div>
      <ul class="feature-list">
        ${features.map((feature) => `<li>${feature}</li>`).join("")}
      </ul>
      <button class="primary-button ${rank.id === "member" ? "hidden" : ""}" data-rank-buy="${rank.id}">
        Buy ${rank.name}
      </button>
      <button class="ghost-button ${rank.id !== "member" ? "hidden" : ""}" disabled>
        Member is free
      </button>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll("[data-rank-buy]").forEach((button) => {
    button.addEventListener("click", () => {
      const rankId = button.getAttribute("data-rank-buy");
      state.selectedRank = state.config.ranks.find((rank) => rank.id === rankId);
      if (!storeAvailable()) {
        setMessage("rank-message", "Store checkout is temporarily offline right now.", true);
        return;
      }
      if (!state.token) {
        setMessage("rank-message", "Log in first so we know which gem balance to use.", true);
        openModal("auth-modal");
        return;
      }
      document.querySelector('#rank-form [name="rankId"]').value = rankId;
      document.getElementById("rank-modal-title").textContent = `Buy ${state.selectedRank.name} for ${state.selectedRank.gemCost} gems`;
      openModal("rank-modal");
    });
  });
}

function renderAccount() {
  const target = document.getElementById("account-summary");
  if (!state.account) {
    target.className = "account-summary empty-state";
    target.textContent =
      !storeAvailable()
        ? "The live store backend is offline right now, so account ordering is disabled until it comes back."
        : "Log in or create an account through a gem order to see your gem balance here.";
    return;
  }

  const gemOrdersMarkup =
    state.gemOrders.length === 0
      ? "<div class='account-tile'>No gem orders yet.</div>"
      : state.gemOrders
          .slice()
          .reverse()
          .map(
            (order) => `
              <div class="account-tile">
                <div class="data-row"><strong>${order.gems} gems</strong><span>${currency.format(order.amountUsd)}</span></div>
                <div class="data-row"><span>${new Date(order.createdAt).toLocaleString()}</span><span class="status-pill ${
                  order.status === "approved" ? "status-approved" : "status-pending"
                }">${order.status}</span></div>
              </div>
            `
          )
          .join("");

  const rankOrdersMarkup =
    state.rankOrders.length === 0
      ? "<div class='account-tile'>No rank requests yet.</div>"
      : state.rankOrders
          .slice()
          .reverse()
          .map(
            (order) => `
              <div class="account-tile">
                <div class="data-row"><strong>${order.rankName}</strong><span>${order.gemCost} gems</span></div>
                <div class="data-row"><span>${order.minecraftUsername} · ${order.edition}</span><span class="status-pill ${
                  order.status === "approved" ? "status-approved" : "status-pending"
                }">${order.status}</span></div>
              </div>
            `
          )
          .join("");

  target.className = "account-summary";
  target.innerHTML = `
    <div class="account-tile">
      <p class="mini-label">Logged in as ${state.account.username}</p>
      <div class="account-balance">${state.account.gemsBalance} gems</div>
      <p>${state.account.email}</p>
      <p class="helper-text">Connected to live backend.</p>
    </div>
    <div class="account-tile">
      <p class="mini-label">Gem orders</p>
      ${gemOrdersMarkup}
    </div>
    <div class="account-tile">
      <p class="mini-label">Rank requests</p>
      ${rankOrdersMarkup}
    </div>
  `;
}

async function loadConfig() {
  state.config = await apiFetch("/api/config", { method: "GET" });
  renderRanks();
}

async function loadAccount() {
  if (!state.token) {
    state.account = null;
    state.gemOrders = [];
    state.rankOrders = [];
    renderAccount();
    return;
  }

  try {
    const data = await apiFetch("/api/account", { method: "GET" });
    state.account = data.account;
    state.gemOrders = data.gemOrders;
    state.rankOrders = data.rankOrders;
    renderAccount();
  } catch {
    localStorage.removeItem("waffle_token");
    state.token = "";
    state.account = null;
    state.gemOrders = [];
    state.rankOrders = [];
    renderAccount();
  }
}

function setupButtons() {
  ["open-login", "account-login"].forEach((id) =>
    document.getElementById(id).addEventListener("click", () => openModal("auth-modal"))
  );

  ["open-gem-order", "hero-buy-gems", "account-buy-gems"].forEach((id) =>
    document.getElementById(id).addEventListener("click", () => {
      if (!storeAvailable()) {
        updateStoreStatus();
        return;
      }
      const signedIn = Boolean(state.token);
      document.getElementById("signup-fields").classList.toggle("hidden", signedIn);
      document.getElementById("gems-modal-title").textContent = signedIn
        ? "Order more gems"
        : "Create your account and order gems";
      openModal("gems-modal");
    })
  );

  document.getElementById("hero-view-account").addEventListener("click", async () => {
    if (!state.token) {
      openModal("auth-modal");
      return;
    }
    await loadAccount();
    document.getElementById("account-summary").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.getElementById("refresh-account").addEventListener("click", loadAccount);
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => closeModal(button.getAttribute("data-close")))
  );
}

function setupForms() {
  const gemsInput = document.querySelector('#gems-form [name="gems"]');
  const previewCost = () => {
    const amount = Number(gemsInput.value || 0) / 100;
    document.getElementById("gems-cost-preview").textContent = `${currency.format(amount)} total`;
  };
  gemsInput.addEventListener("input", previewCost);
  previewCost();

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!storeAvailable()) {
      setMessage("login-message", "Store login is temporarily offline right now.", true);
      return;
    }
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password")
        })
      });
      state.token = data.token;
      localStorage.setItem("waffle_token", data.token);
      setMessage("login-message", "Login successful.");
      closeModal("auth-modal");
      await loadAccount();
    } catch (error) {
      setMessage("login-message", error.message, true);
    }
  });

  document.getElementById("gems-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!storeAvailable()) {
      setMessage("gems-message", "Gem checkout is temporarily offline right now.", true);
      return;
    }
    const payload = { gems: Number(form.get("gems")) };
    const endpoint = state.token ? "/api/gems/order" : "/api/auth/register-order";

    if (!state.token) {
      payload.email = form.get("email");
      payload.username = form.get("username");
      payload.password = form.get("password");
    }

    try {
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (data.token) {
        state.token = data.token;
        localStorage.setItem("waffle_token", data.token);
      }
      setMessage("gems-message", data.message);
      event.currentTarget.reset();
      document.querySelector('#gems-form [name="gems"]').value = 300;
      previewCost();
      await loadAccount();
    } catch (error) {
      setMessage("gems-message", error.message, true);
    }
  });

  document.getElementById("rank-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!storeAvailable()) {
      setMessage("rank-message", "Rank checkout is temporarily offline right now.", true);
      return;
    }
    try {
      const data = await apiFetch("/api/ranks/order", {
        method: "POST",
        body: JSON.stringify({
          rankId: form.get("rankId"),
          minecraftUsername: form.get("minecraftUsername"),
          edition: form.get("edition")
        })
      });
      setMessage("rank-message", data.message);
      closeModal("rank-modal");
      await loadAccount();
    } catch (error) {
      setMessage("rank-message", error.message, true);
    }
  });
}

async function init() {
  setupButtons();
  setupForms();
  const backend = await detectBackend();
  state.backendMode = backend.mode;
  state.sharedBackendReady = backend.shared;
  updateStoreStatus();
  await loadConfig();
  await loadAccount();
}

init();
