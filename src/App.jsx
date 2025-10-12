import React, { useEffect, useMemo, useState } from "react";

// ContentOS — React Single-File Preview (clean, router-ready structure)
// This canvas version is self-contained and compiles on its own.
// It mirrors the structure we'll use in a Vite + React Router + TS app.
// Includes: sessions, page locks, CSV refdata, three button webhooks,
// social scaffolding, and reset.

// ----------------------
// Utilities
// ----------------------
const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2);

function useLocal(key, init) {
  const [state, setState] = useState(() => {
    try {
      const raw =
        typeof window !== "undefined" ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// FIXED: newline handling
function parseCSV(text) {
  const rows = [];
  let cur = "",
    inQuotes = false,
    row = [];

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (row.length) {
      rows.push(row);
      row = [];
    }
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      n = text[i + 1];

    if (c === '"') {
      if (inQuotes && n === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      pushCell();
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && n === "\n") {
        i++;
      }
      pushCell();
      pushRow();
    } else {
      cur += c;
    }
  }

  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const outRows = rows
    .slice(1)
    .filter((r) => r.some((v) => (v ?? "").trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
      return obj;
    });
  return { headers, rows: outRows };
}

async function postWebhook(url, type, data) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        ...data,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error(`Webhook ${type} failed:`, e);
    return false;
  }
}

const WEBHOOKS = {
  startSession:
    "http://localhost:5678/webhook-test/3c135f0d-ffad-4324-b30e-eaed69086ae7",
  brandProfile:
    "http://localhost:5678/webhook-test/8787372f-aa37-4295-af51-f18c0b7d6a65",
  snapshotChange:
    "http://localhost:5678/webhook-test/639bda29-a5db-478c-912b-acd8753deb41",
};

const FLOW_ORDER = [
  "brand",
  "topics",
  "snapshot",
  "article",
  "social",
  "podcast",
];

// ----------------------
// Icons
// ----------------------
const Icon = {
  Sparkles: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M5 3l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4zm11 2l1.5 3 3 1.5-3 1.5L16 12l-1.5-3L11 7.5 14.5 6 16 3zM13 13l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4z" />
    </svg>
  ),
  List: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z" />
    </svg>
  ),
  Camera: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M9 3l2 2h4a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3V8a3 3 0 013-3h1l2-2h0zm3 6a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z" />
    </svg>
  ),
  Doc: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 1v5h5" />
    </svg>
  ),
  Chat: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M4 4h12a3 3 0 013 3v6a3 3 0 01-3 3H9l-5 4v-4H4a3 3 0 01-3-3V7a3 3 0 013-3z" />
    </svg>
  ),
  Mic: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zM11 19h2v3h-2z" />
    </svg>
  ),
};

// ----------------------
// Small UI helpers
// ----------------------
function Stepper({ current, steps }) {
  return (
    <div className="sticky top-0 z-10 bg-transparent px-[7vw] pt-4">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 grid place-items-center rounded-full border ${
                i <= current
                  ? "bg-white text-[#0b1020] border-white"
                  : "border-[#2a3357] text-slate-300"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`${i === current ? "font-semibold" : "opacity-70"}`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="w-10 h-px bg-[#2a3357] mx-1" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-sm">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
      />
    </label>
  );
}

function TopicEditor({
  topics,
  removeTopic,
  tempTopic,
  setTempTopic,
  tempContext,
  setTempContext,
  editingTopicId,
  onEditTopic,
  onCancelEdit,
}) {
  const hasTopic = topics.length > 0;
  const inputDisabled = hasTopic && !editingTopicId;

  return (
    <div>
      {editingTopicId && (
        <div className="flex items-center justify-between mb-2 text-xs text-slate-300">
          <span>Editing existing topic</span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="px-2 py-1 rounded border border-[#2a3357] hover:bg-[#151a32]"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 mb-3">
        <input
          value={tempTopic}
          onChange={(e) => setTempTopic(e.target.value)}
          placeholder="Topic e.g., Pricing AI agents"
          disabled={inputDisabled}
          className={`bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 ${
            inputDisabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
        />
        <textarea
          value={tempContext}
          onChange={(e) => setTempContext(e.target.value)}
          placeholder="Optional context for this topic..."
          rows={3}
          disabled={inputDisabled}
          className={`bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 ${
            inputDisabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
        />
      </div>
      {inputDisabled && (
        <p className="text-sm text-slate-300">
          Only one topic can be saved. Use edit to update or remove to clear it.
        </p>
      )}
      {!!topics.length && (
        <ul className="space-y-2">
          {topics.slice(0, 1).map((t) => (
            <li
              key={t.id}
              className="bg-[#151a32] border border-[#232941] rounded-lg p-3"
            >
              <div className="flex justify-between items-center">
                <strong>{t.name}</strong>
                <div className="flex gap-2">
                  <button
                    className="bg-[#242a4f] px-2 py-1 rounded"
                    onClick={() => onEditTopic(t)}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-[#242a4f] px-2 py-1 rounded"
                    onClick={() => removeTopic(0)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {t.context && (
                <p className="mt-2 text-sm text-slate-300">{t.context}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------
// Page components
// ----------------------
function BrandPage({ brand, setBrand, saveBrand, webhooks }) {
  const [showBrandDetails, setShowBrandDetails] = useState(false);
  const handleSaveAndContinue = async () => {
    await postWebhook(
      webhooks.brandProfile,
      "brand_save_click",
      { brand }
    );
    await saveBrand();
  };
  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Your Brand Voice</h2>
      </header>
      <div className="bg-[#121629] border border-[#232941] rounded-2xl">
        <button
          type="button"
          onClick={() => setShowBrandDetails((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200"
        >
          <span>Brand voice details</span>
          <span className="text-lg">{showBrandDetails ? "▾" : "▸"}</span>
        </button>
        {showBrandDetails && (
          <div className="border-t border-[#232941] px-4 pb-4 pt-3">
            <form
              className="grid md:grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <label className="flex flex-col gap-2 text-sm">
                Archetype
                <select
                  value={brand.archetype}
                  onChange={(e) =>
                    setBrand({ ...brand, archetype: e.target.value })
                  }
                  className="bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                >
                  <option value="">Select…</option>
                  {[
                    "Magician",
                    "Sage",
                    "Hero",
                    "Rebel",
                    "Explorer",
                    "Caregiver",
                    "Creator",
                    "Ruler",
                    "Everyperson",
                    "Innocent",
                    "Jester",
                    "Lover",
                  ].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                Tone of Voice
                <input
                  value={brand.tone}
                  onChange={(e) => setBrand({ ...brand, tone: e.target.value })}
                  placeholder="clear, bold, human…"
                  className="bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                Audience
                <input
                  value={brand.audience}
                  onChange={(e) =>
                    setBrand({ ...brand, audience: e.target.value })
                  }
                  placeholder="KBB retailers, UK SMB owners…"
                  className="bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                />
              </label>
              <details className="md:col-span-2">
                <summary className="cursor-pointer text-sm font-medium text-slate-200 py-2">
                  Additional Voice Details
                </summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm md:col-span-2">
                    Values (comma-separated)
                    <input
                      value={brand.values}
                      onChange={(e) =>
                        setBrand({ ...brand, values: e.target.value })
                      }
                      placeholder="clarity, control, optimise"
                      className="bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm md:col-span-2">
                    Signature Phrases
                    <input
                      value={brand.phrases}
                      onChange={(e) =>
                        setBrand({ ...brand, phrases: e.target.value })
                      }
                      placeholder="Model Your Success™, chaos → clarity…"
                      className="bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm md:col-span-2">
                    Style Notes
                    <textarea
                      value={brand.style}
                      onChange={(e) =>
                        setBrand({ ...brand, style: e.target.value })
                      }
                      rows={4}
                      placeholder="Short sentences, UK spelling…"
                      className="bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                    />
                  </label>
                </div>
              </details>
            </form>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4 mt-4">
              <div className="flex flex-col">
                <button
                  onClick={handleSaveAndContinue}
                  className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
                >
                  Save & Continue
                </button>
                <p className="mt-1 text-xs italic text-slate-400">
                  {webhooks.brandProfile}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TopicsPage({
  topics,
  removeTopic,
  tempTopic,
  setTempTopic,
  tempContext,
  setTempContext,
  editingTopicId,
  startEditingTopic,
  cancelEditingTopic,
  nextFromTopics,
}) {
  const handleNext = async () => {
    const trimmedTopic = tempTopic.trim();
    const trimmedContext = tempContext.trim();
    const isEditing = Boolean(editingTopicId);
    let pendingTopic = null;
    let topicsPayload = topics;

    if (isEditing) {
      if (!trimmedTopic) {
        alert("Please enter a topic before continuing.");
        return;
      }
      topicsPayload = topics.map((topic) =>
        topic.id === editingTopicId
          ? { ...topic, name: trimmedTopic, context: trimmedContext }
          : topic
      );
    } else if (trimmedTopic) {
      if (topics.length >= 1) {
        alert("Only one topic is allowed. Edit the existing topic to make changes.");
        return;
      }
      pendingTopic = {
        id: uuid(),
        name: trimmedTopic,
        context: trimmedContext,
      };
      topicsPayload = [...topics, pendingTopic];
    }

    if (!topicsPayload.length) {
      alert("Please enter a topic (context optional) before continuing.");
      return;
    }
    await postWebhook(
      "http://localhost:5678/webhook-test/3b79f412-93b8-4467-9e34-62b323d3623a",
      "topics_continue_click",
      { topics: topicsPayload }
    );
    nextFromTopics({ pendingTopic, topicsPayload, isEditing });
  };
  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Topics</h2>
      </header>
      <TopicEditor
        topics={topics}
        removeTopic={removeTopic}
        tempTopic={tempTopic}
        setTempTopic={setTempTopic}
        tempContext={tempContext}
        setTempContext={setTempContext}
        editingTopicId={editingTopicId}
        onEditTopic={startEditingTopic}
        onCancelEdit={cancelEditingTopic}
      />
      <div className="mt-6 flex flex-col items-end">
        <button
          onClick={handleNext}
          className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
        >
          Continue
        </button>
        <p className="mt-1 text-xs italic text-slate-400">
          http://localhost:5678/webhook-test/3b79f412-93b8-4467-9e34-62b323d3623a
        </p>
      </div>
    </section>
  );
}

function SnapshotPage({
  topics,
  snapshot,
  setSnapshot,
  n8n,
  setN8N,
  snapshotChange,
  setSnapshotChange,
  sending,
  sendSnapshotChange,
  navTo,
  webhooks,
}) {
  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Delivery Snapshot</h2>
      </header>
      {!!topics.length && (
        <div className="mb-4 bg-[#121629] border border-[#232941] rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-300">Selected topics</span>
            <button
              type="button"
              onClick={() => navTo("topics")}
              className="text-xs font-semibold px-3 py-1 rounded-lg border border-[#2a3357] hover:bg-[#151a32]"
            >
              Change Topic
            </button>
          </div>
          <ul className="grid md:grid-cols-2 gap-3">
            {topics.map((t) => (
              <li
                key={t.id}
                className="bg-[#151a32] border border-[#232941] rounded-xl p-3"
              >
                <div className="font-semibold">{t.name}</div>
                {t.context && (
                  <p className="text-sm text-slate-300 mt-1">{t.context}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <label className="block text-sm">
          Snapshot (free-form)
          <textarea
            value={snapshot.text}
            onChange={(e) => setSnapshot({ text: e.target.value })}
            rows={12}
            placeholder="This will be filled automatically by n8n later…"
            className="w-full bg-[#0f1427] border border-[#232941] rounded-xl p-3 mt-2"
          />
        </label>
        <button
          onClick={() => {
            navTo("article");
          }}
          className="mt-3 bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
        >
          Save & Continue →
        </button>
        <pre className="mt-3 bg-[#0a0f22] border border-dashed border-[#2a3357] rounded-xl p-3 whitespace-pre-wrap">
          {snapshot.text || "—"}
        </pre>
      </div>

      <div className="mt-6 bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <h3 className="text-lg font-semibold mb-2">
          Request changes to this snapshot
        </h3>
        <label className="block text-sm">
          Your change request
          <textarea
            value={snapshotChange}
            onChange={(e) => setSnapshotChange(e.target.value)}
            rows={6}
            placeholder="Type any edits, additions, removals, or clarifications you want applied to the snapshot…"
            className="w-full bg-[#0f1427] border border-[#232941] rounded-xl p-3 mt-2"
          />
        </label>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <label className="block text-sm">
            n8n Webhook URL
            <input
              value={n8n.webhook}
              onChange={(e) => setN8N({ ...n8n, webhook: e.target.value })}
              placeholder="https://your-n8n-host/webhook/xxxx"
              className="mt-2 w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
            />
          </label>
          <div className="flex flex-col items-start justify-end">
            <button
              onClick={sendSnapshotChange}
              disabled={sending}
              className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send to n8n"}
            </button>
            <p className="mt-1 text-xs italic text-slate-400">
              {webhooks.snapshotChange}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Payload includes your change text, current snapshot, topics, and brand
          metadata.
        </p>
      </div>
    </section>
  );
}

function ArticlePage({
  article,
  setArticle,
  n8n,
  topics,
  brand,
  articleChange,
  setArticleChange,
  sendingArticle,
  sendArticleChange,
  navTo,
  setN8N,
}) {
  const handleArticleChangeKeyDown = (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!sendingArticle) {
        sendArticleChange();
      }
    }
  };

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Article</h2>
      </header>
      <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <label className="block text-sm">
          Article (free-form)
          <textarea
            value={article.content}
            onChange={(e) =>
              setArticle({
                content: e.target.value,
                savedAt: new Date().toISOString(),
              })
            }
            rows={12}
            placeholder="Draft or paste your article here… (n8n can overwrite this later)"
            className="w-full bg-[#0f1427] border border-[#232941] rounded-xl p-3 mt-2"
          />
        </label>
        <div className="flex justify-end mt-3">
          <button
            onClick={async () => {
              if (!n8n.webhook.trim()) {
                alert("Please set your n8n webhook URL first.");
                return;
              }
              try {
                const ok = await postWebhook(
                  n8n.webhook,
                  "generate_social_from_article",
                  {
                    articleContent: article.content,
                    topics,
                    brand,
                  }
                );
                if (!ok) throw new Error("HTTP error");
                alert("Requested social generation via n8n ✔︎");
              } catch (e) {
                console.error(e);
                alert("n8n request failed.");
              }
            }}
            className="bg-[#222845] border border-[#2a3357] text-white font-bold px-4 py-2 rounded-xl"
          >
            Generate Article →
          </button>
        </div>
        <pre className="mt-3 bg-[#0a0f22] border border-dashed border-[#2a3357] rounded-xl p-3 whitespace-pre-wrap">
          {article.content || "—"}
        </pre>
      </div>

      <div className="mt-6 bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <h3 className="text-lg font-semibold mb-2">
          Request changes to this article
        </h3>
        <div className="bg-[#0a0f22] border border-[#2a3357] rounded-2xl p-3">
          <textarea
            value={articleChange}
            onChange={(e) => setArticleChange(e.target.value)}
            onKeyDown={handleArticleChangeKeyDown}
            rows={4}
            placeholder="Type your change request…"
            className="w-full bg-transparent border-none focus:outline-none text-sm resize-none"
          />
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="block text-sm md:flex-1">
            n8n Webhook URL
            <input
              value={n8n.webhook}
              onChange={(e) => setN8N({ ...n8n, webhook: e.target.value })}
              placeholder="https://your-n8n-host/webhook/xxxx"
              className="mt-2 w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
            />
          </label>
          <div className="flex items-center justify-end gap-3">
            <p className="text-xs text-slate-400 hidden md:block">Press Ctrl + Enter to send</p>
            <button
              onClick={sendArticleChange}
              disabled={sendingArticle}
              className="bg-white text-[#0b1020] font-bold px-3 py-2 rounded-lg text-sm disabled:opacity-60"
            >
              {sendingArticle ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Press Ctrl + Enter to send instantly. Payload includes your change text,
          current article, topics, and brand metadata.
        </p>
      </div>
      <div className="mt-10 flex justify-end">
        <button
          onClick={() => navTo("social")}
          className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
        >
          Save & Continue →
        </button>
      </div>
    </section>
  );
}

function SocialPage({
  social,
  setSocial,
  makeShorts,
  makePolls,
  makeCarousels,
  makeImages,
  makeNewsletters,
  navTo,
  loadSocialSample,
}) {
  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Social Media Posts</h2>
        <div className="flex gap-2">
          <button
            onClick={loadSocialSample}
            className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
          >
            Load Sample
          </button>
          <button
            onClick={() =>
              setSocial({
                shorts: makeShorts(),
                polls: makePolls(),
                quote: { text: "", author: "" },
                carousels: makeCarousels(),
                images: makeImages(),
                newsletters: makeNewsletters(),
              })
            }
            className="bg-[#222845] border border-[#2a3357] px-4 py-2 rounded-xl"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">10 Shorts Video Scripts</h3>
            <span className="text-xs text-slate-400">
              {social.shorts.length}/10
            </span>
          </div>
          <ol className="space-y-3 list-decimal pl-6">
            {social.shorts.map((s, i) => (
              <li
                key={i}
                className="bg-[#151a32] border border-[#232941] rounded-xl p-3"
              >
                <input
                  value={s.title}
                  onChange={(e) => {
                    const n = [...social.shorts];
                    n[i] = { ...n[i], title: e.target.value };
                    setSocial({ ...social, shorts: n });
                  }}
                  placeholder={"Title for Short #" + (i + 1)}
                  className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 mb-2"
                />
                <textarea
                  value={s.script}
                  onChange={(e) => {
                    const n = [...social.shorts];
                    n[i] = { ...n[i], script: e.target.value };
                    setSocial({ ...social, shorts: n });
                  }}
                  rows={4}
                  placeholder="Hook → Body → CTA"
                  className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2"
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => navTo("podcast")}
          className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
        >
          Continue → Podcast
        </button>
      </div>
    </section>
  );
}

function PodcastPage({ podcast, setPodcast }) {
  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Podcast Script</h2>
      </header>
      <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <Field
          label="Episode Title"
          value={podcast.title}
          onChange={(v) => setPodcast({ ...podcast, title: v })}
          placeholder="Consistency is the power move"
        />
        <label className="block text-sm mt-3">
          Outline
          <textarea
            value={podcast.outline}
            onChange={(e) =>
              setPodcast({ ...podcast, outline: e.target.value })
            }
            rows={8}
            placeholder="Intro, 3 key points, close…"
            className="w-full bg-[#0f1427] border border-[#232941] rounded-xl p-3 mt-2"
          />
        </label>
        <button className="mt-3 bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl">
          Save
        </button>
        <pre className="mt-3 bg-[#0a0f22] border border-dashed border-[#2a3357] rounded-xl p-3 whitespace-pre-wrap">
          {JSON.stringify(podcast, null, 2)}
        </pre>
      </div>
    </section>
  );
}

// ----------------------
// App Shell (router-like nav + state)
// ----------------------
function ContentOSApp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // navigation (hash-style to keep canvas happy)
  const getViewFromHash = () => {
    if (typeof window === "undefined") return FLOW_ORDER[0];
    const hash = window.location?.hash
      ? window.location.hash.slice(1)
      : "";
    return FLOW_ORDER.includes(hash) ? hash : FLOW_ORDER[0];
  };

  const [view, setView] = useState(getViewFromHash);
  useEffect(() => {
    const onHash = () => setView(getViewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navTo = (v) => {
    if (locks.brand && v === "brand") return;
    if (view === "brand" && v !== "brand")
      setLocks((l) => ({ ...l, brand: true }));
    window.location.hash = v;
    setView(v);
  };

  // state
  const [session, setSession] = useLocal("contentos.session", {
    id: "",
    startedAt: "",
  });
  const startNewSession = () => {
    const id = uuid();
    const startedAt = new Date().toISOString();
    setSession({ id, startedAt });
    setLocks({ brand: false });
    return id;
  };

  const [locks, setLocks] = useLocal("contentos.locks", {
    brand: false,
  });
  const [refdata, setRefdata] = useLocal("contentos.refdata", {
    headers: [],
    rows: [],
  });
  const [brand, setBrand] = useLocal("contentos.brand", {
    archetype: "",
    tone: "",
    audience: "",
    values: "",
    phrases: "",
    style: "",
  });
  const [topics, setTopics] = useLocal("contentos.topics", []);
  useEffect(() => {
    if (topics.length > 1) {
      setTopics([topics[0]]);
    }
  }, [topics, setTopics]);
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [tempTopic, setTempTopic] = useState("");
  const [tempContext, setTempContext] = useState("");
  const [snapshot, setSnapshot] = useLocal("contentos.snapshot", { text: "" });
  const [article, setArticle] = useLocal("contentos.article", {
    content: "",
    savedAt: null,
  });
  const [podcast, setPodcast] = useLocal("contentos.podcast", {
    title: "",
    outline: "",
  });
  const [n8n, setN8N] = useLocal("contentos.n8n", { webhook: "" });

  // social presets
  const makeShorts = () =>
    Array.from({ length: 10 }, (_, i) => ({
      title: `Short #${i + 1}`,
      script: "",
    }));
  const makePolls = () =>
    Array.from({ length: 3 }, () => ({ question: "", options: ["", ""] }));
  const makeCarousels = () => [
    {
      title: "Carousel",
      slides: [
        { heading: "Slide 1", body: "" },
        { heading: "Slide 2", body: "" },
        { heading: "Slide 3", body: "" },
      ],
    },
  ];
  const makeImages = () =>
    Array.from({ length: 5 }, (_, i) => ({
      caption: `Image post #${i + 1}`,
      alt: "",
    }));
  const makeNewsletters = () =>
    Array.from({ length: 3 }, (_, i) => ({
      subject: `Newsletter #${i + 1}`,
      body: "",
    }));
  const [social, setSocial] = useLocal("contentos.social.design", {
    shorts: makeShorts(),
    polls: makePolls(),
    quote: { text: "", author: "" },
    carousels: makeCarousels(),
    images: makeImages(),
    newsletters: makeNewsletters(),
  });

  // topic helpers
  const addTopic = (topic) => setTopics([topic]);
  const removeTopic = (i) =>
    setTopics((t) => {
      const removed = t[i];
      const next = t.filter((_, idx) => idx !== i);
      if (removed?.id === editingTopicId) {
        setEditingTopicId(null);
        setTempTopic("");
        setTempContext("");
      }
      return next;
    });
  const startEditingTopic = (topic) => {
    setEditingTopicId(topic.id);
    setTempTopic(topic.name);
    setTempContext(topic.context || "");
  };
  const cancelEditingTopic = () => {
    setEditingTopicId(null);
    setTempTopic("");
    setTempContext("");
  };
  const nextFromTopics = ({ pendingTopic, topicsPayload, isEditing }) => {
    if (isEditing) {
      setTopics(topicsPayload);
      setEditingTopicId(null);
      setTempTopic("");
      setTempContext("");
    } else if (pendingTopic) {
      addTopic(pendingTopic);
      setTempTopic("");
      setTempContext("");
    }
    navTo("snapshot");
  };

  // brand webhook + progress
  const saveBrand = async () => {
    if (!brand.archetype || !brand.tone) {
      alert("Please select an archetype and set your tone to continue.");
      return;
    }
    // dump a small subset of localStorage for debugging
    const keys = [
      "contentos.brand",
      "contentos.topics",
      "contentos.snapshot",
      "contentos.article",
      "contentos.social.design",
      "contentos.n8n",
    ];
    const storageDump = {};
    try {
      keys.forEach((k) => {
        const v = localStorage.getItem(k);
        if (v != null) {
          try {
            storageDump[k] = JSON.parse(v);
          } catch {
            storageDump[k] = v;
          }
        }
      });
    } catch {}
    const payload = {
      type: "brand_profile",
      source: "contentos.app",
      brand,
      sessionId: session.id || startNewSession(),
      url: window.location?.href || "",
      hash: window.location?.hash || "",
      storage: storageDump,
      refdataSummary: {
        columns: (refdata.headers || []).length,
        rows: (refdata.rows || []).length,
      },
      timestamp: new Date().toISOString(),
    };
    try {
      const ok = await postWebhook(
        WEBHOOKS.brandProfile,
        "brand_profile",
        payload
      );
      if (!ok) throw new Error("HTTP error");
      setLocks((l) => ({ ...l, brand: true }));
      navTo("topics");
    } catch (err) {
      console.error("Brand webhook failed:", err);
      if (window.confirm("Could not reach n8n. Continue to Topics anyway?")) {
        setLocks((l) => ({ ...l, brand: true }));
        navTo("topics");
      }
    }
  };

  // snapshot/article change requests
  const [snapshotChange, setSnapshotChange] = useState("");
  const [sending, setSending] = useState(false);
  const sendSnapshotChange = async () => {
    if (!snapshotChange.trim())
      return alert("Please type the changes you want to send.");
    try {
      setSending(true);
      const ok = await postWebhook(
        WEBHOOKS.snapshotChange,
        "snapshot_change_request",
        {
          changes: snapshotChange,
          snapshotText: snapshot.text,
          topics,
          brand,
        }
      );
      if (!ok) throw new Error("HTTP error");
      alert("Sent to n8n ✔︎");
      setSnapshotChange("");
    } catch (e) {
      console.error(e);
      alert("Could not send to n8n.");
    } finally {
      setSending(false);
    }
  };

  const [articleChange, setArticleChange] = useState("");
  const [sendingArticle, setSendingArticle] = useState(false);
  const sendArticleChange = async () => {
    if (!articleChange.trim())
      return alert("Please type the article changes you want to send.");
    if (!n8n.webhook?.trim())
      return alert("Please set your n8n webhook URL first.");
    try {
      setSendingArticle(true);
      const ok = await postWebhook(n8n.webhook, "article_change_request", {
        changes: articleChange,
        articleContent: article.content,
        topics,
        brand,
      });
      if (!ok) throw new Error("HTTP error");
      alert("Article change request sent to n8n ✔︎");
      setArticleChange("");
    } catch (e) {
      console.error(e);
      alert("Could not send to n8n.");
    } finally {
      setSendingArticle(false);
    }
  };

  // reset
  const resetSession = () => {
    if (
      !window.confirm(
        "Reset session? This clears brand, topics, snapshot, article, social, locks, refdata, and webhook settings."
      )
    )
      return false;
    try {
      const toDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("contentos.")) toDelete.push(k);
      }
      toDelete.forEach((k) => localStorage.removeItem(k));
    } catch {}
    setSession({ id: "", startedAt: "" });
    setLocks({ brand: false });
    setBrand({
      archetype: "",
      tone: "",
      audience: "",
      values: "",
      phrases: "",
      style: "",
    });
    setTopics([]);
    setTempTopic("");
    setTempContext("");
    setSnapshot({ text: "" });
    setArticle({ content: "", savedAt: null });
    setPodcast({ title: "", outline: "" });
    setSocial({
      shorts: makeShorts(),
      polls: makePolls(),
      quote: { text: "", author: "" },
      carousels: makeCarousels(),
      images: makeImages(),
      newsletters: makeNewsletters(),
    });
    setN8N({ webhook: "" });
    setRefdata({ headers: [], rows: [] });
    setView("brand");
    try {
      window.location.hash = "brand";
    } catch {}
    return true;
  };

  const flow = FLOW_ORDER;
  const steps = [
    "Your Brand Voice",
    "Topics",
    "Snapshot",
    "Article",
    "Social",
    "Podcast",
  ];
  const views = [
    { id: "brand", label: "Your Brand Voice", icon: Icon.Sparkles },
    { id: "topics", label: "Topics", icon: Icon.List },
    { id: "snapshot", label: "Delivery Snapshot", icon: Icon.Camera },
    { id: "article", label: "Article", icon: Icon.Doc },
    { id: "social", label: "Social Media Posts", icon: Icon.Chat },
    { id: "podcast", label: "Podcast Script", icon: Icon.Mic },
  ];
  const currentIndex = useMemo(() => Math.max(0, flow.indexOf(view)), [view]);

  // sanity checks (dev only)
  useEffect(() => {
    try {
      console.assert(steps.length === flow.length, "Steps mismatch");
      const sample = parseCSV("a,b\n1,2");
      console.assert(
        sample.headers.length === 2 && sample.rows.length === 1,
        "CSV basic failed"
      );
    } catch {}
  }, []);

  return (
    <div
      className={`min-h-screen grid ${sidebarOpen ? "grid-cols-[280px_1fr]" : "grid-cols-[0_1fr]"} text-slate-100`}
      style={{
        background:
          "radial-gradient(1200px 800px at 60% 40%, #131831 0%, #0b1024 45%, #0a0e1d 100%)",
      }}
    >
      {/* Sidebar */}
      <aside className={`bg-[#0f1220] border-r border-[#1c2135] flex flex-col gap-4 p-4 overflow-hidden ${sidebarOpen ? "" : "opacity-0 pointer-events-none"}`}>
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 grid place-items-center rounded-full bg-indigo-600">
            🔑
          </div>
          <div>
            <div className="font-bold">ContentOS</div>
            <div className="text-xs text-slate-400 -mt-0.5">
              Brand Voice Engine
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {views.map((v) => {
            const disabled = locks.brand && v.id === "brand";
            const I = v.icon;
            return (
              <button
                key={v.id}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  navTo(v.id);
                }}
                className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-[#151a32] ${
                  view === v.id ? "bg-[#1a1f3c]" : ""
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <I className="w-4 h-4 opacity-90" />
                <span>{v.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-3 px-3 pt-3 border-t border-[#1c2135]">
          <div className="w-8 h-8 rounded-full bg-[#6d5bd0] grid place-items-center font-bold">
            U
          </div>
          <div>Your Brand</div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative overflow-auto">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 p-3 bg-[#0b1024]/60 backdrop-blur border-b border-[#1c2135]">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen((v) => !v)}
              className="px-3 py-1 rounded-lg border border-[#2a3357] hover:bg-[#151a32]">
              ☰ Menu
            </button>
            <div className="text-sm opacity-70">
              {({
                "brand":"Your Brand Voice",
                "topics":"Topics",
                "snapshot":"Delivery Snapshot",
                "article":"Article",
                "social":"Social Media Posts",
                "podcast":"Podcast Script"
              })[view] ?? "ContentOS"}
            </div>
          </div>
          <button
            onClick={resetSession}
            className="px-3 py-1 rounded-lg border border-[#2a3357] hover:bg-[#151a32]"
          >
            New
          </button>
        </div>

        <Stepper current={currentIndex} steps={steps} />

        {view === "brand" && (
          <BrandPage
            brand={brand}
            setBrand={setBrand}
            saveBrand={saveBrand}
            webhooks={WEBHOOKS}
          />
        )}
        {view === "topics" && (
          <TopicsPage
            topics={topics}
            removeTopic={removeTopic}
            tempTopic={tempTopic}
            setTempTopic={setTempTopic}
            tempContext={tempContext}
            setTempContext={setTempContext}
            editingTopicId={editingTopicId}
            startEditingTopic={startEditingTopic}
            cancelEditingTopic={cancelEditingTopic}
            nextFromTopics={nextFromTopics}
          />
        )}
        {view === "snapshot" && (
          <SnapshotPage
            topics={topics}
            snapshot={snapshot}
            setSnapshot={setSnapshot}
            n8n={n8n}
            setN8N={setN8N}
            snapshotChange={snapshotChange}
            setSnapshotChange={setSnapshotChange}
            sending={sending}
            sendSnapshotChange={sendSnapshotChange}
            navTo={navTo}
            webhooks={WEBHOOKS}
          />
        )}
        {view === "article" && (
          <ArticlePage
            article={article}
            setArticle={setArticle}
            n8n={n8n}
            topics={topics}
            brand={brand}
            articleChange={articleChange}
            setArticleChange={setArticleChange}
            sendingArticle={sendingArticle}
            sendArticleChange={sendArticleChange}
            navTo={navTo}
            setN8N={setN8N}
          />
        )}
        {view === "social" && (
          <SocialPage
            social={social}
            setSocial={setSocial}
            makeShorts={makeShorts}
            makePolls={makePolls}
            makeCarousels={makeCarousels}
            makeImages={makeImages}
            makeNewsletters={makeNewsletters}
            navTo={navTo}
            loadSocialSample={() =>
              setSocial({
                shorts: Array.from({ length: 10 }, (_, i) => ({
                  title: `Consistency Wins (${i + 1})`,
                  script: `Hook: What if you shipped weekly?
Point: ${i + 1} small reps beat 1 big launch.
CTA: Save this and start.`,
                })),
                polls: [
                  {
                    question: "Which format do you prefer?",
                    options: ["Shorts", "Carousel", "Newsletter", "Podcast"],
                  },
                  {
                    question: "Posting cadence?",
                    options: ["Daily", "3x weekly", "Weekly", "Monthly"],
                  },
                  {
                    question: "Biggest blocker?",
                    options: ["Time", "Ideas", "Confidence", "Process"],
                  },
                ],
                quote: { text: "Action creates clarity.", author: "ContentOS" },
                carousels: [
                  {
                    title: "5 Mistakes to Avoid",
                    slides: [
                      {
                        heading: "No cadence",
                        body: "Inconsistent posting kills momentum.",
                      },
                      {
                        heading: "No angle",
                        body: "Generic ideas get ignored.",
                      },
                      { heading: "Too long", body: "Shorten to ship faster." },
                      { heading: "No CTA", body: "Tell them the next step." },
                      {
                        heading: "No repurpose",
                        body: "Squeeze more from winners.",
                      },
                    ],
                  },
                ],
                images: [
                  { caption: "Behind the scenes" },
                  { caption: "Client win snapshot" },
                  { caption: "Quick tip" },
                  { caption: "My stack" },
                  { caption: "Workshop highlight" },
                ],
                newsletters: [
                  {
                    subject: "Week 1 — Ship Your First",
                    body: "Start with 300–500 words. Ship it.",
                  },
                  {
                    subject: "Week 2 — Angle Library",
                    body: "Save hooks that work. Reuse.",
                  },
                  {
                    subject: "Week 3 — Metrics that Matter",
                    body: "Track outputs > vanity likes.",
                  },
                ],
              })
            }
          />
        )}
        {view === "podcast" && (
          <PodcastPage podcast={podcast} setPodcast={setPodcast} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <ContentOSApp />;
}
