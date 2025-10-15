const DEFAULT_SNAPSHOT_ENDPOINT = 
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_N8N_SNAPSHOT_URL) ||
  "/api/n8n/snapshot";

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("Snapshot response was not valid JSON", error);
    return { raw: text };
  }
}

export async function postSnapshot(payload, options = {}) {
  const endpoint = options.endpoint || DEFAULT_SNAPSHOT_ENDPOINT;
  const body = payload ?? {};

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...options.fetchOptions,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const error = new Error(
      errorBody || `Snapshot request failed with status ${response.status}`
    );
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  return readJsonResponse(response);
}
