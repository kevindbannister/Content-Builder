type SectionKey =
  | "problem"
  | "model"
  | "metaphor"
  | "caseStat"
  | "actionSteps"
  | "oneLiner";

interface Section {
  key: SectionKey;
  title: string;
  content: string;
  order: number;
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
  const ds = payload?.deliverySnapshotUpdate;
  const secs = Array.isArray(ds?.sections) ? ds!.sections : [];

  // Canonical keys we expect (in order)
  const wanted: SectionKey[] = [
    "problem",
    "model",
    "metaphor",
    "caseStat",
    "actionSteps",
    "oneLiner",
  ];

  // Build a map for fast lookup
  const byKey = secs.reduce<Record<SectionKey, string>>(
    (acc, s) => {
      const k = s?.key as SectionKey;
      if (wanted.includes(k)) acc[k] = (s?.content || "").trim();
      return acc;
    },
    {
      problem: "",
      model: "",
      metaphor: "",
      caseStat: "",
      actionSteps: "",
      oneLiner: "",
    }
  );

  return {
    archetype: ds?.archetype ?? "",
    topic: ds?.topic ?? "",
    problem: byKey.problem,
    model: byKey.model,
    metaphor: byKey.metaphor,
    caseStat: byKey.caseStat,
    actionSteps: byKey.actionSteps,
    oneLiner: byKey.oneLiner,
    // optional: if you want the full article too
    articleText: payload?.messageReply?.text ?? "",
    articleHtml: payload?.messageReply?.html ?? "",
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
  return mapSections(data);
}
