import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundledLocalDbPath = path.join(__dirname, "_shared.local-db.json");

const ADMIN_USERNAME = "COOLMAN155";
const ADMIN_PASSWORD = "8675309b";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const GEM_RATE = 100;
const STORE_KEY = "main";
const DB_SHAPE = {
  accounts: [],
  gemOrders: [],
  rankOrders: [],
  sessions: [],
  adminSessions: []
};

const RANKS = {
  member: {
    id: "member",
    name: "Member",
    priceUsd: 0,
    gemCost: 0,
    homes: 2,
    marketSlots: 5,
    priorityQueue: false,
    shopCashMultiplier: 1
  },
  vip: {
    id: "vip",
    name: "VIP",
    priceUsd: 3,
    gemCost: 300,
    homes: 4,
    marketSlots: 11,
    priorityQueue: false,
    shopCashMultiplier: 1
  },
  vipPlus: {
    id: "vipPlus",
    name: "VIP+",
    priceUsd: 5,
    gemCost: 500,
    homes: 5,
    marketSlots: 16,
    priorityQueue: true,
    shopCashMultiplier: 1
  },
  wafflelord: {
    id: "wafflelord",
    name: "Wafflelord",
    priceUsd: 8,
    gemCost: 800,
    homes: 6,
    marketSlots: 20,
    priorityQueue: true,
    shopCashMultiplier: 1.25
  }
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function emptyDb() {
  return JSON.parse(JSON.stringify(DB_SHAPE));
}

function blobStore() {
  return getStore({ name: "wafflesmp-store", consistency: "strong" });
}

function usingNetlifyBlobs(context) {
  return Boolean(context?.site?.id && context.site.id !== "local-dev");
}

async function getStorageStatus(context) {
  if (!usingNetlifyBlobs(context)) {
    return { mode: "local-dev", shared: false };
  }

  try {
    const store = blobStore();
    await store.get(STORE_KEY, { type: "json" });
    return { mode: "blobs", shared: true };
  } catch {
    return { mode: "fallback", shared: false };
  }
}

function localDbPathFor(context) {
  if (context?.site?.id === "local-dev") {
    return bundledLocalDbPath;
  }

  const writableTmp = process.env.TMPDIR || process.env.TEMP || "/tmp";
  return path.join(writableTmp, "wafflesmp-store-db.json");
}

function readLocalDb(context) {
  const localDbPath = localDbPathFor(context);
  if (!fs.existsSync(localDbPath)) {
    fs.writeFileSync(localDbPath, JSON.stringify(emptyDb(), null, 2));
  }
  return JSON.parse(fs.readFileSync(localDbPath, "utf8"));
}

function writeLocalDb(db, context) {
  const localDbPath = localDbPathFor(context);
  fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
}

async function readDb(context) {
  if (usingNetlifyBlobs(context)) {
    try {
      const store = blobStore();
      return (await store.get(STORE_KEY, { type: "json" })) || emptyDb();
    } catch (error) {
      return readLocalDb(context);
    }
  }

  return readLocalDb(context);
}

async function writeDb(db, context) {
  if (usingNetlifyBlobs(context)) {
    try {
      const store = blobStore();
      await store.setJSON(STORE_KEY, db);
      return;
    } catch (error) {
      writeLocalDb(db, context);
      return;
    }
  }
  writeLocalDb(db, context);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
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

function getAuthToken(req) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function pruneSessions(db) {
  const now = Date.now();
  db.sessions = db.sessions.filter((entry) => now - new Date(entry.createdAt).getTime() < TOKEN_TTL_MS);
  db.adminSessions = db.adminSessions.filter(
    (entry) => now - new Date(entry.createdAt).getTime() < TOKEN_TTL_MS
  );
}

function computeRevenue(db) {
  return db.gemOrders
    .filter((order) => order.status === "approved")
    .reduce((sum, order) => sum + order.amountUsd, 0);
}

function collectDashboard(db) {
  return {
    stats: {
      totalRevenueUsd: computeRevenue(db),
      totalAccounts: db.accounts.length,
      pendingGemOrders: db.gemOrders.filter((order) => order.status === "pending").length,
      pendingRankOrders: db.rankOrders.filter((order) => order.status === "pending").length
    },
    accounts: db.accounts.map((account) => sanitizeAccount(account)),
    gemOrders: db.gemOrders.map((order) => {
      const account = db.accounts.find((entry) => entry.id === order.accountId);
      return {
        ...order,
        accountUsername: account ? account.username : "Unknown",
        email: account ? account.email : ""
      };
    }),
    rankOrders: db.rankOrders.map((order) => {
      const account = db.accounts.find((entry) => entry.id === order.accountId);
      return {
        ...order,
        accountUsername: account ? account.username : "Unknown"
      };
    })
  };
}

function requireUser(req, db) {
  pruneSessions(db);
  const token = getAuthToken(req);
  const session = db.sessions.find((entry) => entry.token === token);
  if (!session) {
    return { error: jsonResponse({ error: "You need to log in first." }, 401) };
  }
  const account = db.accounts.find((entry) => entry.id === session.accountId);
  if (!account) {
    return { error: jsonResponse({ error: "Account session is no longer valid." }, 401) };
  }
  return { account };
}

function requireAdmin(req, db) {
  pruneSessions(db);
  const token = getAuthToken(req);
  const session = db.adminSessions.find((entry) => entry.token === token);
  if (!session) {
    return { error: jsonResponse({ error: "Admin login required." }, 401) };
  }
  return { ok: true };
}

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const routedPath =
      url.pathname === "/.netlify/functions/api" && url.searchParams.get("path")
        ? `/api/${url.searchParams.get("path")}`
        : url.pathname;

    if (req.method === "GET" && routedPath === "/api/health") {
      const storage = await getStorageStatus(context);
      return jsonResponse({
        ok: true,
        backend: "netlify-function",
        storage
      });
    }

    if (req.method === "GET" && routedPath === "/api/config") {
      return jsonResponse({ ranks: Object.values(RANKS), gemRate: GEM_RATE });
    }

    const db = await readDb(context);
    pruneSessions(db);

    if (req.method === "GET" && routedPath === "/api/account") {
      const auth = requireUser(req, db);
      if (auth.error) return auth.error;
      await writeDb(db, context);
      return jsonResponse({
        account: sanitizeAccount(auth.account),
        gemOrders: db.gemOrders.filter((order) => order.accountId === auth.account.id),
        rankOrders: db.rankOrders.filter((order) => order.accountId === auth.account.id)
      });
    }

    if (req.method === "GET" && routedPath === "/api/admin/dashboard") {
      const admin = requireAdmin(req, db);
      if (admin.error) return admin.error;
      await writeDb(db, context);
      return jsonResponse(collectDashboard(db));
    }

    const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await req.json() : {};

    if (req.method === "POST" && routedPath === "/api/auth/register-order") {
      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const gems = safeNumber(body.gems);

      if (username.length < 3 || username.length > 20) {
        return jsonResponse({ error: "Username must be between 3 and 20 characters." }, 400);
      }
      if (!email.includes("@")) {
        return jsonResponse({ error: "Enter a valid email address." }, 400);
      }
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
      }
      if (!Number.isInteger(gems) || gems < 100) {
        return jsonResponse({ error: "Minimum gem order is 100 gems." }, 400);
      }
      if (db.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
        return jsonResponse({ error: "That username is already taken." }, 409);
      }
      if (db.accounts.some((account) => account.email === email)) {
        return jsonResponse({ error: "That email already has an account." }, 409);
      }

      const account = {
        id: makeId("acct"),
        username,
        email,
        passwordHash: hashPassword(password),
        gemsBalance: 0,
        createdAt: new Date().toISOString()
      };
      const order = {
        id: makeId("gems"),
        accountId: account.id,
        gems,
        amountUsd: gems / GEM_RATE,
        status: "pending",
        createdAt: new Date().toISOString(),
        instructions:
          "Within 48 hours you will get an email with our PayPal, your requested gems, and the total cost. After payment is verified, your gems will be added to this account."
      };
      const token = crypto.randomBytes(18).toString("hex");

      db.accounts.push(account);
      db.gemOrders.push(order);
      db.sessions.push({ token, accountId: account.id, createdAt: new Date().toISOString() });
      await writeDb(db, context);

      return jsonResponse(
        {
          message:
            "Account created. Within 48 hours you will get an email with our PayPal, your gem amount, and the total cost.",
          token,
          account: sanitizeAccount(account),
          order
        },
        201
      );
    }

    if (req.method === "POST" && routedPath === "/api/auth/login") {
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      const account = db.accounts.find((entry) => entry.username.toLowerCase() === username.toLowerCase());

      if (!account || account.passwordHash !== hashPassword(password)) {
        return jsonResponse({ error: "Invalid username or password." }, 401);
      }

      const token = crypto.randomBytes(18).toString("hex");
      db.sessions.push({ token, accountId: account.id, createdAt: new Date().toISOString() });
      await writeDb(db, context);
      return jsonResponse({
        message: "Logged in successfully.",
        token,
        account: sanitizeAccount(account)
      });
    }

    if (req.method === "POST" && routedPath === "/api/gems/order") {
      const auth = requireUser(req, db);
      if (auth.error) return auth.error;
      const gems = safeNumber(body.gems);

      if (!Number.isInteger(gems) || gems < 100) {
        return jsonResponse({ error: "Minimum gem order is 100 gems." }, 400);
      }

      const order = {
        id: makeId("gems"),
        accountId: auth.account.id,
        gems,
        amountUsd: gems / GEM_RATE,
        status: "pending",
        createdAt: new Date().toISOString(),
        instructions:
          "Within 48 hours you will get an email with our PayPal, your requested gems, and the total cost. After payment is verified, your gems will be added to this account."
      };
      db.gemOrders.push(order);
      await writeDb(db, context);
      return jsonResponse(
        {
          message:
            "Gem order received. Within 48 hours you will get an email with our PayPal, your gem amount, and the total cost.",
          order
        },
        201
      );
    }

    if (req.method === "POST" && routedPath === "/api/ranks/order") {
      const auth = requireUser(req, db);
      if (auth.error) return auth.error;
      const rankId = String(body.rankId || "");
      const minecraftUsername = normalizeUsername(body.minecraftUsername);
      const edition = String(body.edition || "").toLowerCase();
      const rank = RANKS[rankId];

      if (!rank || rank.id === "member") {
        return jsonResponse({ error: "That rank cannot be purchased." }, 400);
      }
      if (minecraftUsername.length < 3 || minecraftUsername.length > 20) {
        return jsonResponse({ error: "Enter a valid Minecraft username." }, 400);
      }
      if (!["java", "bedrock"].includes(edition)) {
        return jsonResponse({ error: "Pick Java or Bedrock." }, 400);
      }
      if (auth.account.gemsBalance < rank.gemCost) {
        return jsonResponse({ error: "You do not have enough gems for that rank." }, 400);
      }

      auth.account.gemsBalance -= rank.gemCost;
      const order = {
        id: makeId("rank"),
        accountId: auth.account.id,
        rankId: rank.id,
        rankName: rank.name,
        gemCost: rank.gemCost,
        status: "pending",
        minecraftUsername,
        edition,
        createdAt: new Date().toISOString()
      };
      db.rankOrders.push(order);
      await writeDb(db, context);
      return jsonResponse(
        {
          message:
            "Rank request submitted. Waiting for verification and delivery. This can take up to 24 hours.",
          account: sanitizeAccount(auth.account),
          order
        },
        201
      );
    }

    if (req.method === "POST" && routedPath === "/api/admin/login") {
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");

      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return jsonResponse({ error: "Invalid admin login." }, 401);
      }

      const token = crypto.randomBytes(18).toString("hex");
      db.adminSessions.push({ token, createdAt: new Date().toISOString() });
      await writeDb(db, context);
      return jsonResponse({ message: "Admin login successful.", token });
    }

    if (req.method === "POST" && routedPath === "/api/admin/gem-orders/approve") {
      const admin = requireAdmin(req, db);
      if (admin.error) return admin.error;
      const order = db.gemOrders.find((entry) => entry.id === String(body.orderId || ""));
      if (!order) return jsonResponse({ error: "Gem order not found." }, 404);
      if (order.status === "approved") {
        return jsonResponse({ error: "Gem order already approved." }, 400);
      }

      const account = db.accounts.find((entry) => entry.id === order.accountId);
      if (!account) {
        return jsonResponse({ error: "Account not found for this order." }, 404);
      }

      order.status = "approved";
      order.approvedAt = new Date().toISOString();
      account.gemsBalance += order.gems;
      await writeDb(db, context);
      return jsonResponse({
        message: "Gem order approved and gems added to the account.",
        dashboard: collectDashboard(db)
      });
    }

    if (req.method === "POST" && routedPath === "/api/admin/rank-orders/approve") {
      const admin = requireAdmin(req, db);
      if (admin.error) return admin.error;
      const order = db.rankOrders.find((entry) => entry.id === String(body.orderId || ""));
      if (!order) return jsonResponse({ error: "Rank order not found." }, 404);
      if (order.status === "approved") {
        return jsonResponse({ error: "Rank order already approved." }, 400);
      }

      order.status = "approved";
      order.approvedAt = new Date().toISOString();
      await writeDb(db, context);
      return jsonResponse({
        message: "Rank order approved.",
        dashboard: collectDashboard(db)
      });
    }

    return jsonResponse({ error: "Route not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: error.message || "Unexpected server error." }, 500);
  }
};
