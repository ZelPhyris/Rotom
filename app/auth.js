/* Discord "login" for the static site — OAuth2 implicit flow.
   No backend and no client secret: the button sends the user to Discord, which
   redirects back with a short-lived access token in the URL fragment. We use it
   once to read the user's name + avatar (scope: identify), then show them in the
   navbar. Nothing is stored server-side; the token lives only in this browser. */

const CLIENT_ID = "1513455321853460584";
const REDIRECT_URI = location.origin + "/";
const SCOPE = "identify";
const STORE_KEY = "rotom.discord";

const $ = (id) => document.getElementById(id);

function randomState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function login() {
  const state = randomState();
  sessionStorage.setItem("rotom.oauth_state", state);
  const url =
    "https://discord.com/oauth2/authorize?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "token",
      scope: SCOPE,
      state,
    });
  location.href = url;
}

function logout() {
  localStorage.removeItem(STORE_KEY);
  render(null);
}

// Read the token Discord put in location.hash after redirect, if any.
function consumeRedirect() {
  if (!location.hash.startsWith("#")) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const token = p.get("access_token");
  if (!token) return null;

  const expected = sessionStorage.getItem("rotom.oauth_state");
  sessionStorage.removeItem("rotom.oauth_state");
  // Clear the fragment so the token never lingers in the address bar / history.
  history.replaceState(null, "", location.pathname + location.search);
  if (expected && p.get("state") !== expected) return null;

  const expiresAt = Date.now() + Number(p.get("expires_in") || 0) * 1000;
  return { token, expiresAt };
}

function storedSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && s.token && s.expiresAt > Date.now()) return s;
  } catch {}
  return null;
}

function avatarUrl(u) {
  if (u.avatar) {
    const ext = u.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=64`;
  }
  const i = Number((BigInt(u.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${i}.png`;
}

function render(user) {
  const loginBtn = $("login-btn");
  const menu = $("user-menu");
  if (user) {
    $("user-avatar").src = avatarUrl(user);
    $("user-name").textContent = user.global_name || user.username;
    loginBtn.hidden = true;
    menu.hidden = false;
  } else {
    loginBtn.hidden = false;
    menu.hidden = true;
  }
}

async function fetchUser(token) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function init() {
  $("login-btn")?.addEventListener("click", login);
  $("logout-btn")?.addEventListener("click", logout);

  let session = consumeRedirect();
  if (session) localStorage.setItem(STORE_KEY, JSON.stringify(session));
  else session = storedSession();

  if (!session) {
    render(null);
    return;
  }

  try {
    render(await fetchUser(session.token));
  } catch {
    logout(); // token rejected/expired — fall back to logged-out state
  }
}

init();
