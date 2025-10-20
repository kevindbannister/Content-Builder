type SectionKey =
  | "problem"
  | "model"
  | "metaphor"
  | "caseStat"
  | "actionSteps"
  | "oneLiner";

interface Section {
  key?: string;
  title?: string;
  content?: string;
  order?: number;
}

interface Payload {
  messageReply?: { text?: string; html?: string };
  deliverySnapshotUpdate?: {
    archetype?: string;
    topic?: string;
    sections?: Section[];
  };
}

export function mapSections(payload: Payload) {
  const ds = payload?.deliverySnapshotUpdate ?? {};
  const secs = Array.isArray(ds.sections) ? ds.sections : [];

  const byKey: Record<string, string> = {};
  for (const section of secs) {
    if (!section || typeof section !== "object") continue;
    const key = typeof section.key === "string" ? section.key : undefined;
    if (!key) continue;
    const content =
      typeof section.content === "string" ? section.content.trim() : "";
    byKey[key] = content;
  }

  const getValue = (key: SectionKey) => byKey[key] ?? "";

  return {
    archetype: typeof ds.archetype === "string" ? ds.archetype : "",
    topic: typeof ds.topic === "string" ? ds.topic : "",
    problem: getValue("problem"),
    model: getValue("model"),
    metaphor: getValue("metaphor"),
    caseStat: getValue("caseStat"),
    actionSteps: getValue("actionSteps"),
    oneLiner: getValue("oneLiner"),
  };
}

export async function postSnapshot(payload: any) {
  const url = import.meta.env.VITE_N8N_WEBHOOK_URL;
  if (!url) throw new Error("VITE_N8N_WEBHOOK_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`n8n failed: ${res.status}`);
  const data = await res.json();
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as any;
}
