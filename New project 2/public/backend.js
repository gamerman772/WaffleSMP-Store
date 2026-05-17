const GEM_RATE = 100;
const LOCAL_DB_KEY = "wafflesmp_local_db_v1";
const USER_TOKEN_KEY = "waffle_token";
const ADMIN_TOKEN_KEY = "waffle_admin_token";
const ADMIN_USERNAME = "COOLMAN155";
const ADMIN_PASSWORD = "8675309b";

export const RANKS = [
  {
    id: "member",
    name: "Member",
    priceUsd: 0,
    gemCost: 0,
    homes: 2,
    marketSlots: 5,
    priorityQueue: false,
    shopCashMultiplier: 1
  },
  {
    id: "vip",
    name: "VIP",
    priceUsd: 3,
    gemCost: 300,
    homes: 4,
    marketSlots: 11,
    priorityQueue: false,
    shopCashMultiplier: 1
  },
  {
    id: "vipPlus",
    name: "VIP+",
    priceUsd: 5,
    gemCost: 500,
    homes: 5,
    marketSlots: 16,
    priorityQueue: true,
    shopCashMultiplier: 1
  },
  {
    id: "wafflelord",
    name: "Wafflelord",
    priceUsd: 8,
    gemCost: 800,
    homes: 6,
    marketSlots: 20,
    priorityQueue: true,
    shopCashMultiplier: 1.25
  }
];

const RANK_MAP = Object.fromEntries(RANKS.map((rank) => [rank.id, rank]));

function emptyDb() {
  return {
    accounts: [],
    gemOrders: [],
    rankOrders: [],
    sessions: [],
    adminSessions: []
  };
}

function loadDb() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || JSON.stringify(emptyDb()));
  } catch {
    return emptyDb();
  }
}

function saveDb(db) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

function sanitizeAccount(account) {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    gemsBalance: account.gemsBalance,
    createdAt: account.createdAt
  };
}

function authToken(headers = {}) {
  const auth = headers.Authorization || headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function requireUser(db, headers) {
  const token = authToken(headers);
  const session = db.sessions.find((entry) => entry.token === token);
  if (!session) throw new Error("You need to log in first.");
  const account = db.accounts.find((entry) => entry.id === session.accountId);
  if (!account) throw new Error("Account session is no longer valid.");
  return account;
}

function requireAdmin(db, headers) {
  const token = authToken(headers);
  const session = db.adminSessions.find((entry) => entry.token === token);
  if (!session) throw new Error("Admin login required.");
}

function dashboard(db) {
  return {
    stats: {
      totalRevenueUsd: db.gemOrders
        .filter((order) => order.status === "approved")
        .reduce((sum, order) => sum + order.amountUsd, 0),
      totalAccounts: db.accounts.length,
      pendingGemOrders: db.gemOrders.filter((order) => order.status === "pending").length,
      pendingRankOrders: db.rankOrders.filter((order) => order.status === "pending").length
    },
    accounts: db.accounts.map((account) => sanitizeAccount(account)),
    gemOrders: db.gemOrders.map((order) => {
      const account = db.accounts.find((entry) => entry.id === order.accountId);
      return { ...order, accountUsername: account?.username || "Unknown", email: account?.email || "" };
    }),
    rankOrders: db.rankOrders.map((order) => {
      const account = db.accounts.find((entry) => entry.id === order.accountId);
      return { ...order, accountUsername: account?.username || "Unknown" };
    })
  };
}

function localApi(url, options = {}) {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body ? JSON.parse(options.body) : {};
  const db = loadDb();

  if (method === "GET" && url === "/api/config") {
    return { ranks: RANKS, gemRate: GEM_RATE };
  }

  if (method === "POST" && url === "/api/auth/register-order") {
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const gems = Number(body.gems);

    if (username.length < 3 || username.length > 20) throw new Error("Username must be between 3 and 20 characters.");
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (!Number.isInteger(gems) || gems < 100) throw new Error("Minimum gem order is 100 gems.");
    if (db.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("That username is already taken.");
    }
    if (db.accounts.some((account) => account.email === email)) {
      throw new Error("That email already has an account.");
    }

    const account = {
      id: randomId("acct"),
      username,
      email,
      password,
      gemsBalance: 0,
      createdAt: new Date().toISOString()
    };
    const order = {
      id: randomId("gems"),
      accountId: account.id,
      gems,
      amountUsd: gems / GEM_RATE,
      status: "pending",
      createdAt: new Date().toISOString(),
      instructions:
        "Within 48 hours you will get an email with our PayPal, your requested gems, and the total cost. After payment is verified, your gems will be added to this account."
    };
    const token = randomId("user");
    db.accounts.push(account);
    db.gemOrders.push(order);
    db.sessions.push({ token, accountId: account.id });
    saveDb(db);
    localStorage.setItem(USER_TOKEN_KEY, token);

    return {
      message:
        "Account created. Within 48 hours you will get an email with our PayPal, your gem amount, and the total cost.",
      token,
      account: sanitizeAccount(account),
      order
    };
  }

  if (method === "POST" && url === "/api/auth/login") {
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    const account = db.accounts.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
    if (!account || account.password !== password) throw new Error("Invalid username or password.");
    const token = randomId("user");
    db.sessions.push({ token, accountId: account.id });
    saveDb(db);
    localStorage.setItem(USER_TOKEN_KEY, token);
    return { message: "Logged in successfully.", token, account: sanitizeAccount(account) };
  }

  if (method === "GET" && url === "/api/account") {
    const account = requireUser(db, headers);
    return {
      account: sanitizeAccount(account),
      gemOrders: db.gemOrders.filter((order) => order.accountId === account.id),
      rankOrders: db.rankOrders.filter((order) => order.accountId === account.id)
    };
  }

  if (method === "POST" && url === "/api/gems/order") {
    const account = requireUser(db, headers);
    const gems = Number(body.gems);
    if (!Number.isInteger(gems) || gems < 100) throw new Error("Minimum gem order is 100 gems.");
    const order = {
      id: randomId("gems"),
      accountId: account.id,
      gems,
      amountUsd: gems / GEM_RATE,
      status: "pending",
      createdAt: new Date().toISOString(),
      instructions:
        "Within 48 hours you will get an email with our PayPal, your requested gems, and the total cost. After payment is verified, your gems will be added to this account."
    };
    db.gemOrders.push(order);
    saveDb(db);
    return {
      message:
        "Gem order received. Within 48 hours you will get an email with our PayPal, your gem amount, and the total cost.",
      order
    };
  }

  if (method === "POST" && url === "/api/ranks/order") {
    const account = requireUser(db, headers);
    const rank = RANK_MAP[String(body.rankId || "")];
    const minecraftUsername = normalizeUsername(body.minecraftUsername);
    const edition = String(body.edition || "").toLowerCase();

    if (!rank || rank.id === "member") throw new Error("That rank cannot be purchased.");
    if (minecraftUsername.length < 3 || minecraftUsername.length > 20) throw new Error("Enter a valid Minecraft username.");
    if (!["java", "bedrock"].includes(edition)) throw new Error("Pick Java or Bedrock.");
    if (account.gemsBalance < rank.gemCost) throw new Error("You do not have enough gems for that rank.");

    account.gemsBalance -= rank.gemCost;
    const order = {
      id: randomId("rank"),
      accountId: account.id,
      rankId: rank.id,
      rankName: rank.name,
      gemCost: rank.gemCost,
      status: "pending",
      minecraftUsername,
      edition,
      createdAt: new Date().toISOString()
    };
    db.rankOrders.push(order);
    saveDb(db);
    return {
      message: "Rank request submitted. Waiting for verification and delivery. This can take up to 24 hours.",
      account: sanitizeAccount(account),
      order
    };
  }

  if (method === "POST" && url === "/api/admin/login") {
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) throw new Error("Invalid admin login.");
    const token = randomId("admin");
    db.adminSessions.push({ token });
    saveDb(db);
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    return { message: "Admin login successful.", token };
  }

  if (method === "GET" && url === "/api/admin/dashboard") {
    requireAdmin(db, headers);
    return dashboard(db);
  }

  if (method === "POST" && url === "/api/admin/gem-orders/approve") {
    requireAdmin(db, headers);
    const order = db.gemOrders.find((entry) => entry.id === String(body.orderId || ""));
    if (!order) throw new Error("Gem order not found.");
    if (order.status === "approved") throw new Error("Gem order already approved.");
    const account = db.accounts.find((entry) => entry.id === order.accountId);
    if (!account) throw new Error("Account not found for this order.");
    order.status = "approved";
    order.approvedAt = new Date().toISOString();
    account.gemsBalance += order.gems;
    saveDb(db);
    return { message: "Gem order approved and gems added to the account.", dashboard: dashboard(db) };
  }

  if (method === "POST" && url === "/api/admin/rank-orders/approve") {
    requireAdmin(db, headers);
    const order = db.rankOrders.find((entry) => entry.id === String(body.orderId || ""));
    if (!order) throw new Error("Rank order not found.");
    if (order.status === "approved") throw new Error("Rank order already approved.");
    order.status = "approved";
    order.approvedAt = new Date().toISOString();
    saveDb(db);
    return { message: "Rank order approved.", dashboard: dashboard(db) };
  }

  throw new Error("Route not found.");
}

export async function detectBackend() {
  try {
    const response = await fetch("/api/health", { method: "GET" });
    if (!response.ok) {
      return { mode: "local", shared: false };
    }
    const data = await response.json();
    if (data?.ok && data?.storage?.shared) {
      return { mode: "remote", shared: true };
    }
    return { mode: "local", shared: false };
  } catch {
    return { mode: "local", shared: false };
  }
}

export async function requestApi(mode, url, options = {}) {
  if (mode === "local") {
    return localApi(url, options);
  }

  const response = await fetch(url, options);
  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || "Request failed." };
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}
