import assert from "node:assert/strict";
import test from "node:test";
import gateway from "../pages-gateway/index";

const PUBLIC_ORIGIN = "https://puma-note.pages.dev";
const BACKEND_ORIGIN = "https://puma-policy-v1.kome808.workers.dev";

function fakeEnv(fetch: (request: Request) => Promise<Response> | Response) {
  return { POLICY_BACKEND: { fetch } as unknown as Fetcher };
}

test("forwards URL, method, query, body, CF headers, and normalized Origin", async () => {
  let seen: Request | undefined;
  const env = fakeEnv(async (request) => {
    seen = request;
    return new Response("ok", { headers: { "x-frame-options": "DENY" } });
  });
  const request = new Request(`${PUBLIC_ORIGIN}/api/submit?q=hello`, {
    method: "POST",
    headers: {
      Origin: PUBLIC_ORIGIN,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.8",
      "cf-ray": "test-ray",
    },
    body: JSON.stringify({ value: 7 }),
  });

  const response = await gateway.fetch(request, env);
  assert.equal(response.status, 200);
  assert.equal(seen?.url, `${PUBLIC_ORIGIN}/api/submit?q=hello`);
  assert.equal(seen?.method, "POST");
  assert.equal(await seen?.text(), '{"value":7}');
  assert.equal(seen?.headers.get("origin"), BACKEND_ORIGIN);
  assert.equal(seen?.headers.get("cf-connecting-ip"), "203.0.113.8");
  assert.equal(seen?.headers.get("cf-ray"), "test-ray");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("rejects nonempty unexpected Origin without contacting backend", async () => {
  let called = false;
  const response = await gateway.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/search`, { headers: { Origin: "https://attacker.example" } }),
    fakeEnv(() => { called = true; return new Response(); }),
  );
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("preserves absent Origin and backend response security headers", async () => {
  let seenOrigin: string | null = "unexpected";
  const response = await gateway.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/search?q=x`),
    fakeEnv((request) => {
      seenOrigin = request.headers.get("origin");
      return new Response("safe", {
        headers: {
          "content-security-policy": "default-src 'none'",
          "x-content-type-options": "nosniff",
          "strict-transport-security": "max-age=31536000",
        },
      });
    }),
  );
  assert.equal(seenOrigin, null);
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
});

test("maps backend-origin absolute redirects and preserves relative redirects", async () => {
  const absolute = await gateway.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/login`),
    fakeEnv(() => new Response(null, {
      status: 302,
      headers: { location: `${BACKEND_ORIGIN}/callback?code=abc` },
    })),
  );
  assert.equal(absolute.headers.get("location"), `${PUBLIC_ORIGIN}/callback?code=abc`);

  const relative = await gateway.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/login`),
    fakeEnv(() => new Response(null, { status: 302, headers: { location: "/next" } })),
  );
  assert.equal(relative.headers.get("location"), "/next");
});

test("rejects unexpected hostname", async () => {
  let called = false;
  const response = await gateway.fetch(
    new Request("https://preview.puma-note.pages.dev/api/search"),
    fakeEnv(() => { called = true; return new Response(); }),
  );
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("returns bounded generic 502 when service binding fails", async () => {
  const response = await gateway.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/search`),
    fakeEnv(() => { throw new Error("secret internal detail"); }),
  );
  assert.equal(response.status, 502);
  assert.equal(await response.text(), "Service temporarily unavailable");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
