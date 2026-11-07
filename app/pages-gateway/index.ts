const PUBLIC_ORIGIN = "https://puma-note.pages.dev";
const BACKEND_ORIGIN = "https://puma-policy-v1.kome808.workers.dev";

interface Env {
  POLICY_BACKEND: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname !== "puma-note.pages.dev") {
      return new Response("Not found", { status: 404 });
    }

    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== "" && origin !== PUBLIC_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    const headers = new Headers(request.headers);
    if (origin !== null && origin !== "") {
      // The backend accepts only its established Worker origin. The URL host
      // stays puma-note.pages.dev for Turnstile hostname validation.
      headers.set("Origin", BACKEND_ORIGIN);
    }

    try {
      const backendRequest = new Request(request, { headers });
      const response = await env.POLICY_BACKEND.fetch(backendRequest);
      const location = response.headers.get("Location");
      if (!location) return response;

      let redirect: URL;
      try {
        redirect = new URL(location, url);
      } catch {
        return response;
      }
      if (redirect.origin !== BACKEND_ORIGIN) return response;

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set(
        "Location",
        `${PUBLIC_ORIGIN}${redirect.pathname}${redirect.search}${redirect.hash}`,
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch {
      return new Response("Service temporarily unavailable", {
        status: 502,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
  },
};
