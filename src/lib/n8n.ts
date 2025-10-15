export async function postSnapshot(payload: any) {
  const url = import.meta.env.VITE_N8N_WEBHOOK_URL;
  if (!url) throw new Error("VITE_N8N_WEBHOOK_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`n8n failed: ${res.status}`);
  return res.json(); // expects { snapshot: { ... } }
}
