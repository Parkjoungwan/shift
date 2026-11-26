import { type Env, json } from "./shared";

export { Building } from "./building";

// One shared building for the whole game. Every player and spectator joins it.
function building(env: Env): DurableObjectStub {
  return env.BUILDING.get(env.BUILDING.idFromName("main"));
}

function originAllowed(request: Request, env: Env): boolean {
  const allowed = (env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes("*")) return true;
  const origin = request.headers.get("Origin");
  // Browsers always send Origin on WebSocket handshakes; other clients may omit it.
  return origin === null || allowed.includes(origin);
}

async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      if (!originAllowed(request, env)) return new Response("Origin not allowed", { status: 403 });
      // The building limits connections per address. It gets a salted hash, never the address.
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`shift:${new Date().toISOString().slice(0, 10)}:${ip}`));
      const client = [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const headers = new Headers(request.headers);
      headers.set("X-Shift-Client", client);
      headers.delete("CF-Connecting-IP");
      return building(env).fetch(new Request(request, { headers }));
    }

    if (url.pathname.startsWith("/admin/api/")) {
      if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN is not configured" }, 503);
      const auth = request.headers.get("Authorization") ?? "";
      if (!(await tokenMatches(auth, `Bearer ${env.ADMIN_TOKEN}`))) {
        return json({ error: "unauthorized" }, 401);
      }
      return building(env).fetch(request);
    }

    if (url.pathname === "/health") return json({ ok: true });

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
