const DEFAULT_SNAPSHOT_ENDPOINT = 
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_N8N_SNAPSHOT_URL) ||
  "/api/n8n/snapshot";

export function mapSections(payload = {}) {
  const ds = payload?.deliverySnapshotUpdate ?? {};
  const sections = Array.isArray(ds.sections) ? ds.sections : [];

  const byKey = {};
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const key = typeof section.key === "string" ? section.key : undefined;
    if (!key) continue;
    const content =
      typeof section.content === "string" ? section.content.trim() : "";
    byKey[key] = content;
  }

  const getValue = (key) => byKey[key] ?? "";

  const FLAT_FIELD_MAP = {
    archetype: ["ds_archetype", "archetype"],
    topic: ["ds_topic", "topic"],
    problem: ["ds_problem", "problem"],
    model: ["ds_model", "model"],
    metaphor: ["ds_metaphor", "metaphor"],
    caseStat: ["ds_case_stat", "caseStat", "case_stat"],
    actionSteps: ["ds_action_steps", "actionSteps", "action_steps"],
    oneLiner: ["ds_oneliner", "oneLiner", "oneliner"],
  };

  const sources = [ds, payload?.snapshot, payload];

  const readFlatField = (field) => {
    const keys = FLAT_FIELD_MAP[field] ?? [];
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        const raw = source[key];
        if (typeof raw === "string") return raw;
        if (raw == null) return "";
        return String(raw);
      }
    }
    return undefined;
  };

  return {
    archetype:
      readFlatField("archetype") ??
      (typeof ds.archetype === "string" ? ds.archetype : ""),
    topic:
      readFlatField("topic") ?? (typeof ds.topic === "string" ? ds.topic : ""),
    problem: readFlatField("problem") ?? getValue("problem"),
    model: readFlatField("model") ?? getValue("model"),
    metaphor: readFlatField("metaphor") ?? getValue("metaphor"),
    caseStat: readFlatField("caseStat") ?? getValue("caseStat"),
    actionSteps: readFlatField("actionSteps") ?? getValue("actionSteps"),
    oneLiner: readFlatField("oneLiner") ?? getValue("oneLiner"),
  };
}

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

  const data = await readJsonResponse(response);
  if (!data || typeof data !== "object") {
    return {};
  }
  return data;
}
