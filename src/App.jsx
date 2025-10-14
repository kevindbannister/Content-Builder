import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.9.8";
const VERSION_STORAGE_KEY = "contentos.version";
const SETTINGS_STORAGE_KEYS = [
  "contentos.brand",
  "contentos.contentTypes",
];
const TOPIC_ARCHIVE_STORAGE_KEY = "contentos.topics.archive";

const LOCAL_STORAGE_KEYS = [
  "contentos.session",
  "contentos.locks",
  "contentos.refdata",
  "contentos.topics",
  "contentos.snapshot",
  "contentos.snapshot.chat",
  "contentos.article",
  "contentos.podcast",
  "contentos.social.design",
  "contentos.n8n",
  TOPIC_ARCHIVE_STORAGE_KEY,
];

const createDefaultBrand = () => ({
  archetype: "",
  tone: "",
  audience: "",
  values: "",
  phrases: "",
  style: "",
});

const createDefaultContentPreferences = () => [];

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureHtmlContent(value) {
  if (!value) return "";
  if (HTML_TAG_PATTERN.test(value)) return value;

  const escaped = escapeHtml(value);

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    const singleLine = escaped.replace(/\n/g, "<br>");
    return singleLine ? `<p>${singleLine}</p>` : "";
  }

  return paragraphs
    .map((paragraph) => {
      const withBreaks = paragraph.replace(/\n/g, "<br>");
      return `<p>${withBreaks || "<br>"}</p>`;
    })
    .join("");
}

const SNAPSHOT_TEXT_KEYS = [
  "html",
  "text",
  "snapshot",
  "content",
  "body",
  "deliverySnapshot",
  "delivery_snapshot",
  "result",
  "data",
];

const SNAPSHOT_SECTION_DEFINITIONS = [
  {
    id: "problem",
    title: "Problem",
    helper: "State the cost of inaction in one sentence.",
    placeholder: "e.g., \"Each launch loses 40% of warm leads before demo day.\"",
    maxChars: 280,
    required: true,
  },
  {
    id: "model",
    title: "Model",
    helper: "Name the framework or method you’ll use to solve it.",
    placeholder:
      "e.g., \"The Launch Lift Framework rebuilds pre-demo nurture in 14 days.\"",
    maxChars: 260,
    required: true,
  },
  {
    id: "metaphor",
    title: "Metaphor",
    helper: "Offer a vivid comparison that makes the model stick.",
    placeholder:
      "e.g., \"It’s like upgrading from a paper map to Waze for your buyer journey.\"",
    maxChars: 180,
    required: true,
  },
  {
    id: "caseStat",
    title: "Case / Stat",
    helper: "Share one proof point—metric, testimonial, or mini-case.",
    placeholder:
      "e.g., \"After the shift, demos jumped 37% and close rates doubled in Q2.\"",
    maxChars: 220,
    required: true,
  },
  {
    id: "actionSteps",
    title: "Action Steps",
    helper: "List 2–3 specific moves the audience can take next.",
    placeholder:
      "e.g., \"1. Audit handoff → 2. Patch nurture gaps → 3. Relaunch with live demo.\"",
    maxChars: 260,
    required: true,
  },
  {
    id: "oneLiner",
    title: "One-liner + Context",
    helper: "Draft the hook and where you’ll use it.",
    placeholder:
      "e.g., \"Stop losing launch leads—drop this in the first slide of your sales deck.\"",
    maxChars: 120,
    required: true,
  },
];

function createEmptySnapshotSections() {
  return SNAPSHOT_SECTION_DEFINITIONS.map((definition) => ({
    id: definition.id,
    content: "",
  }));
}

function createEmptySnapshotState() {
  return {
    sections: createEmptySnapshotSections(),
    aiDraft: "",
    text: "",
  };
}

function extractSnapshotText(raw) {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);

    const findString = (value, visited = new Set()) => {
      if (!value || visited.has(value)) return "";
      if (typeof value === "string") return value;
      if (typeof value !== "object") return "";

      visited.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = findString(item, visited);
          if (found) return found;
        }
        return "";
      }

      for (const key of SNAPSHOT_TEXT_KEYS) {
        if (key in value) {
          const found = findString(value[key], visited);
          if (found) return found;
        }
      }

      for (const key of Object.keys(value)) {
        if (SNAPSHOT_TEXT_KEYS.includes(key)) continue;
        const found = findString(value[key], visited);
        if (found) return found;
      }

      return "";
    };

    const extracted = findString(parsed);
    return extracted || raw;
  } catch {
    return raw;
  }
}

function isHtmlEmpty(value) {
  if (!value) return true;
  const textOnly = value
    .replace(/<br\s*\/?>(\s|&nbsp;)*/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return textOnly.length === 0;
}

function normalizeSnapshot(value) {
  const base = createEmptySnapshotState();
  if (!value || typeof value !== "object") {
    return base;
  }

  const rawSections = Array.isArray(value.sections)
    ? value.sections
        .map((section) => ({
          id: section.id,
          content:
            typeof section.content === "string" ? section.content : "",
        }))
        .filter((section) =>
          SNAPSHOT_SECTION_DEFINITIONS.some((def) => def.id === section.id)
        )
    : [];

  const sectionMap = new Map(
    rawSections.map((section) => [section.id, section])
  );
  const normalizedBase = SNAPSHOT_SECTION_DEFINITIONS.map((definition) => ({
    id: definition.id,
    content: sectionMap.get(definition.id)?.content ?? "",
  }));

  const orderIds = rawSections.map((section) => section.id);
  const orderedSections = [
    ...orderIds
      .map((id) => normalizedBase.find((section) => section.id === id))
      .filter(Boolean),
    ...normalizedBase.filter((section) => !orderIds.includes(section.id)),
  ];

  const aiDraftRaw =
    typeof value.aiDraft === "string"
      ? value.aiDraft
      : typeof value.generatedHtml === "string"
      ? value.generatedHtml
      : typeof value.text === "string" && !rawSections.length
      ? value.text
      : "";

  const aiDraft =
    aiDraftRaw && !HTML_TAG_PATTERN.test(aiDraftRaw)
      ? ensureHtmlContent(aiDraftRaw)
      : aiDraftRaw || "";

  return {
    ...base,
    ...value,
    sections: orderedSections,
    aiDraft,
  };
}

function snapshotSectionsToHtml(sections) {
  if (!Array.isArray(sections)) return "";
  return sections
    .map((section) => {
      const definition = SNAPSHOT_SECTION_DEFINITIONS.find(
        (def) => def.id === section.id
      );
      if (!definition) return "";
      const content = (section.content || "").trim();
      if (!content) return "";
      const heading = escapeHtml(definition.title);
      const bodyHtml = ensureHtmlContent(content);
      return `<section><h3>${heading}</h3>${bodyHtml}</section>`;
    })
    .filter(Boolean)
    .join("");
}

function finalizeSnapshot(value) {
  const normalized = normalizeSnapshot(value);
  return {
    ...normalized,
    text: snapshotSectionsToHtml(normalized.sections),
  };
}

function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const normalized = ensureHtmlContent(value);
    if (normalized !== value) {
      onChange(normalized);
      return;
    }
    if (editorRef.current.innerHTML !== (normalized || "")) {
      editorRef.current.innerHTML = normalized || "";
    }
  }, [value, onChange]);

  const handleInput = (event) => {
    onChange(event.currentTarget.innerHTML);
  };

  const applyCommand = (command, commandValue) => {
    if (typeof document === "undefined" || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, commandValue ?? null);
    onChange(editorRef.current.innerHTML);
  };

  const toolbarButtons = [
    { label: "H2", command: "formatBlock", value: "h2" },
    { label: "H3", command: "formatBlock", value: "h3" },
    { label: "Bold", command: "bold" },
    { label: "Italic", command: "italic" },
    { label: "UL", command: "insertUnorderedList" },
    { label: "OL", command: "insertOrderedList" },
    { label: "Quote", command: "formatBlock", value: "blockquote" },
  ];

  const showPlaceholder = isHtmlEmpty(value);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {toolbarButtons.map((button) => (
          <button
            key={`${button.command}-${button.value ?? "default"}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyCommand(button.command, button.value)}
            className="bg-[#1a2037] border border-[#2a3357] text-xs uppercase tracking-wide text-slate-200 px-3 py-1.5 rounded-lg"
          >
            {button.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          className="rich-text-editor w-full bg-[#0f1427] border border-[#232941] rounded-xl p-3 min-h-[220px] text-sm leading-relaxed focus:outline-none"
          contentEditable
          role="textbox"
          aria-multiline="true"
          onInput={handleInput}
          onBlur={handleInput}
        />
        {showPlaceholder && (
          <span className="pointer-events-none absolute left-3 top-3 text-sm text-slate-500">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

if (typeof window !== "undefined") {
  try {
    const storedVersion = window.localStorage.getItem(VERSION_STORAGE_KEY);
    if (storedVersion !== APP_VERSION) {
      LOCAL_STORAGE_KEYS.forEach((key) => {
        try {
          window.localStorage.removeItem(key);
        } catch {}
      });
      window.localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
      if (storedVersion) {
        window.location.reload();
      }
    }
  } catch (error) {
    console.warn("Version sync skipped due to storage access issue", error);
  }
}

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

async function postWebhookJson(url, type, data) {
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
    const json = await res
      .json()
      .catch(() => null);
    return { ok: res.ok, data: json };
  } catch (error) {
    console.error(`Webhook ${type} failed:`, error);
    return { ok: false, data: null };
  }
}

const WEBHOOKS = {
  startSession: "http://localhost:5678/webhook-test/3c135f0d-ffad-4324-b30e-eaed69086ae7",
  brandProfile: "http://localhost:5678/webhook-test/8787372f-aa37-4295-af51-f18c0b7d6a65",
  topicsContinue: "http://localhost:5678/webhook-test/afcecf7d-65e8-48c8-8205-7eec66e72f15",
  snapshotGenerate: "http://localhost:5678/webhook-test/8792d1e2-8c5b-457f-96b0-63bca95e9ab4",
  articleGenerate: "http://localhost:5678/webhook-test/b30e07dc-0218-493a-a99f-3e0ad96429fc",
  snapshotChange:
    "http://localhost:5678/webhook-test/259d665c-7975-47ba-b3e1-6d7055a40a9e",
  socialTopQuestions:
    "http://localhost:5678/webhook-test/af7a1a02-4113-4703-972a-d34930f2ed05",
  socialShortScripts:
    "http://localhost:5678/webhook-test/50d7627b-9d24-4186-a974-9a09f7f84796",
  socialContinueSave:
    "http://localhost:5678/webhook-test/04461643-7c04-4fa6-a086-c58cbb9a2bcc",
};

const FLOW_ORDER = [
  "topics",
  "snapshot",
  "article",
  "social",
  "polls",
  "images",
  "podcast",
];

const SAMPLE_POLLS = [
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
  {
    question: "How long have you been creating?",
    options: ["<6 months", "6-12 months", "1-3 years", "3+ years"],
  },
  {
    question: "What support do you want next?",
    options: ["Workflows", "Strategy", "Accountability", "Inspiration"],
  },
];

const SAMPLE_IMAGES = [
  { caption: "Behind the scenes", alt: "Editing suite with mood lighting" },
  { caption: "Client win snapshot", alt: "Testimonial quote card" },
  { caption: "Quick tip", alt: "Sticky note with marketing advice" },
  { caption: "My stack", alt: "Flat lay of creator tools" },
  { caption: "Workshop highlight", alt: "Presenter speaking to camera" },
  { caption: "Mood board", alt: "Collage of brand visuals" },
];

const cloneSamplePolls = () =>
  SAMPLE_POLLS.map((poll) => ({
    question: poll.question,
    options: [...poll.options],
  }));

const cloneSampleImages = () =>
  SAMPLE_IMAGES.map((image) => ({ ...image }));

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
  Video: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M4 5a2 2 0 00-2 2v10a2 2 0 002 2h9a2 2 0 002-2v-2l5 3V6l-5 3V7a2 2 0 00-2-2H4z" />
    </svg>
  ),
  Poll: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M5 4h2v16H5zm6 6h2v10h-2zm6-4h2v14h-2z" />
    </svg>
  ),
  Image: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v9l3.5-3.5 2.5 2.5 4-4L19 17V6H5zm4 2a2 2 0 110 4 2 2 0 010-4z" />
    </svg>
  ),
  Mic: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zM11 19h2v3h-2z" />
    </svg>
  ),
  Settings: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M19.14 12.936a7.993 7.993 0 000-1.872l2.036-1.58a.5.5 0 00.12-.638l-1.928-3.34a.5.5 0 00-.607-.22l-2.397.96a7.994 7.994 0 00-1.62-.94l-.36-2.54A.5.5 0 0014.89 2h-3.78a.5.5 0 00-.495.426l-.36 2.54a7.994 7.994 0 00-1.62.94l-2.397-.96a.5.5 0 00-.607.22L3.703 8.486a.5.5 0 00.12.638l2.036 1.58a8.055 8.055 0 000 1.872l-2.036 1.58a.5.5 0 00-.12.638l1.928 3.34a.5.5 0 00.607.22l2.397-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 00.495.426h3.78a.5.5 0 00.495-.426l.36-2.54a7.994 7.994 0 001.62-.94l2.397.96a.5.5 0 00.607-.22l1.928-3.34a.5.5 0 00-.12-.638l-2.036-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
    </svg>
  ),
};

// ----------------------
// Small UI helpers
// ----------------------
function Stepper({ current, steps }) {
  const containerRef = useRef(null);
  const fullMeasureRefs = useRef([]);
  const dotMeasureRef = useRef(null);
  const dotLastMeasureRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measurements, setMeasurements] = useState({
    fullWidths: [],
    dotWithConnector: 0,
    dotWithoutConnector: 0,
  });
  const [displayModes, setDisplayModes] = useState(() =>
    steps.map(() => "full")
  );

  useEffect(() => {
    setDisplayModes((prev) => {
      if (prev.length === steps.length) return prev;
      return steps.map(() => "full");
    });
  }, [steps]);

  const measure = useCallback(() => {
    const nextFull = steps.map(
      (_, index) => fullMeasureRefs.current[index]?.offsetWidth ?? 0
    );
    const nextDotWith = dotMeasureRef.current?.offsetWidth ?? 0;
    const nextDotWithout = dotLastMeasureRef.current?.offsetWidth ?? 0;
    setMeasurements((prev) => {
      const sameFull =
        prev.fullWidths.length === nextFull.length &&
        prev.fullWidths.every((value, idx) => value === nextFull[idx]);
      if (
        sameFull &&
        prev.dotWithConnector === nextDotWith &&
        prev.dotWithoutConnector === nextDotWithout
      ) {
        return prev;
      }
      return {
        fullWidths: nextFull,
        dotWithConnector: nextDotWith,
        dotWithoutConnector: nextDotWithout,
      };
    });
  }, [steps]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    measure();
  }, [measure]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handle = () => {
      measure();
    };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [measure]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;

    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = element.offsetWidth;
      setContainerWidth((prev) =>
        Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth
      );
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [steps.length]);

  useEffect(() => {
    if (!steps.length) return;
    if (!containerWidth) return;
    if (!measurements.fullWidths.length) return;

    const dotWithConnector = measurements.dotWithConnector || measurements.dotWithoutConnector;
    const dotWithoutConnector =
      measurements.dotWithoutConnector || measurements.dotWithConnector;

    if (steps.length > 1 && dotWithConnector === 0) return;
    if (dotWithoutConnector === 0) return;

    const fullWidths = measurements.fullWidths;
    let totalWidth = fullWidths.reduce((sum, width) => sum + width, 0);
    const nextModes = steps.map(() => "full");
    const protectedSet = new Set(
      [current - 1, current, current + 1].filter(
        (idx) => idx >= 0 && idx < steps.length
      )
    );

    const getWidth = (index, mode) => {
      if (mode === "full") return fullWidths[index];
      return index === steps.length - 1
        ? dotWithoutConnector
        : dotWithConnector;
    };

    const convert = (index) => {
      if (nextModes[index] === "dot") return;
      const prevWidth = getWidth(index, "full");
      const nextWidth = getWidth(index, "dot");
      totalWidth = totalWidth - prevWidth + nextWidth;
      nextModes[index] = "dot";
    };

    const future = [];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (i > current + 1 && !protectedSet.has(i)) {
        future.push(i);
      }
    }

    const past = [];
    for (let i = 0; i < steps.length; i++) {
      if (i < current - 1 && !protectedSet.has(i)) {
        past.push(i);
      }
    }

    const order = [...future, ...past];
    for (const index of order) {
      if (totalWidth <= containerWidth) break;
      convert(index);
    }

    setDisplayModes((prev) => {
      const sameLength = prev.length === nextModes.length;
      if (
        sameLength &&
        prev.every((mode, index) => mode === nextModes[index])
      ) {
        return prev;
      }
      return nextModes;
    });
  }, [measurements, containerWidth, steps, current]);

  return (
    <div className="sticky top-0 z-10 bg-transparent px-4 sm:px-[7vw] pt-4">
      <div
        className="flex items-center justify-center gap-2 pb-3 sm:hidden"
        role="status"
        aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
      >
        {steps.map((label, i) => (
          <span
            key={`mobile-${label}-${i}`}
            className={`h-2.5 w-2.5 rounded-full transition-colors duration-200 ${
              i === current ? "bg-white" : "bg-[#2a3357]"
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
      <div
        ref={containerRef}
        className="hidden sm:flex items-center justify-center overflow-hidden whitespace-nowrap pb-3"
      >
        {steps.map((label, index) => {
          const mode = displayModes[index] ?? "full";
          const isCurrent = index === current;
          const isVisited = index < current;
          const showConnector = index < steps.length - 1;

          const circleBase =
            "grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold transition-colors duration-200";
          let circleClasses = circleBase;
          if (isCurrent) {
            circleClasses += " bg-white text-[#0b1020] border-white shadow";
          } else if (isVisited) {
            circleClasses += " bg-[#151a32] text-slate-200 border-[#2a3357] opacity-90";
          } else {
            circleClasses += " border-[#2a3357] text-slate-300";
          }

          const labelBase = "ml-2 text-xs transition-colors duration-200";
          let labelClasses = labelBase;
          if (isCurrent) {
            labelClasses += " font-semibold text-white";
          } else if (isVisited) {
            labelClasses += " text-slate-200";
          } else {
            labelClasses += " text-slate-400";
          }

          const dotClasses = `h-2.5 w-2.5 rounded-full flex-shrink-0 transition-colors duration-200 ${
            isVisited ? "bg-white/70" : "bg-[#2a3357]"
          }`;

          return (
            <div
              key={`${label}-${index}`}
              className="flex items-center whitespace-nowrap"
            >
              {mode === "full" ? (
                <>
                  <span className={circleClasses}>{index + 1}</span>
                  <span className={labelClasses}>{label}</span>
                </>
              ) : (
                <span className="relative flex items-center">
                  <span className={dotClasses} aria-hidden="true" />
                  <span className="sr-only">
                    Step {index + 1}: {label}
                  </span>
                </span>
              )}
              {showConnector && (
                <span
                  className={`${
                    mode === "full" ? "mx-2 w-10" : "mx-1.5 w-6"
                  } h-px bg-[#2a3357] flex-shrink-0`}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 h-0 overflow-hidden opacity-0"
      >
        <div className="flex items-center whitespace-nowrap">
          {steps.map((label, index) => (
            <div
              key={`measure-${label}-${index}`}
              ref={(el) => {
                fullMeasureRefs.current[index] = el;
              }}
              className="flex items-center whitespace-nowrap text-xs"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-white text-xs font-semibold">
                {index + 1}
              </span>
              <span className="ml-2 text-xs font-semibold text-white">{label}</span>
              {index < steps.length - 1 && (
                <span className="mx-2 h-px w-10 bg-[#2a3357]" />
              )}
            </div>
          ))}
        </div>
        <div
          ref={dotMeasureRef}
          className="mt-2 flex items-center whitespace-nowrap"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          <span className="mx-1.5 h-px w-6 bg-[#2a3357]" />
        </div>
        <div
          ref={dotLastMeasureRef}
          className="mt-2 flex items-center whitespace-nowrap"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </div>
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

function ArchiveList({
  archives,
  onRestoreArchive,
  onDeleteArchive,
  activeArchiveId,
}) {
  return (
    <section className="mt-12">
      <header className="mb-3">
        <h3 className="text-lg font-semibold text-slate-200">Archive</h3>
        <p className="text-sm text-slate-400">
          Revisit topics saved from previous sessions.
        </p>
      </header>
      {!archives.length ? (
        <p className="text-sm text-slate-400">
          Archived topics will appear here after you start new sessions.
        </p>
      ) : (
        <ul className="space-y-3">
          {archives.map((entry) => {
            const primaryTopic = entry?.data?.topics?.[0];
            const savedLabel = entry.savedAt
              ? new Date(entry.savedAt).toLocaleString()
              : null;
            const isActive = entry.id === activeArchiveId;
            return (
              <li
                key={entry.id}
                className={`rounded-xl border border-[#232941] bg-[#121629] p-4 transition ${
                  isActive ? "border-indigo-400/80" : "hover:border-[#2f3963]"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-indigo-300/70">
                      {entry.title || "Archived topic"}
                    </p>
                    {primaryTopic?.context && (
                      <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                        {primaryTopic.context}
                      </p>
                    )}
                    <div className="mt-2 text-xs text-slate-400">
                      {savedLabel && <span>Saved {savedLabel}</span>}
                      {entry.startedAt && (
                        <span className="block">
                          Session started {new Date(entry.startedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={() => onRestoreArchive(entry.id)}
                      className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-[#0b1020] transition hover:bg-slate-100"
                    >
                      Load session
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteArchive(entry.id)}
                      className="rounded-lg border border-[#2a3357] px-4 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-[#1a2037]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ----------------------
// Page components
// ----------------------
// Settings Page (brand voice + preferences)
function SettingsPage({
  brand,
  contentPreferences,
  locks,
  onSave,
  onDirtyChange,
  webhooks,
  ensureSessionId,
  onReset,
}) {
  const [activeTab, setActiveTab] = useState("brand");
  const [showBrandDetails, setShowBrandDetails] = useState(true);
  const brandDisabled = Boolean(locks?.brand);

  const [draftBrand, setDraftBrand] = useState(brand);
  const [draftContentPreferences, setDraftContentPreferences] = useState(
    contentPreferences
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    setDraftBrand(brand);
  }, [brand]);

  useEffect(() => {
    setDraftContentPreferences(contentPreferences);
  }, [contentPreferences]);

  const tabs = [
    { id: "content", label: "Your Content" },
    { id: "brand", label: "Your Brand Voice" },
    { id: "snapshot", label: "Snapshot" },
    { id: "article", label: "Article" },
    { id: "social", label: "Social" },
    { id: "podcast", label: "Podcast" },
  ];

  const contentOptions = [
    "Short Videos",
    "Long-form Videos",
    "Podcasts",
    "Image Posts",
    "Polls",
    "Newsletters",
    "Live Streams",
    "Articles",
  ];

  const toggleContentPreference = (option) => {
    setDraftContentPreferences((prev) => {
      const exists = prev.includes(option);
      if (exists) {
        return prev.filter((item) => item !== option);
      }
      return [...prev, option];
    });
  };

  const brandChanged = useMemo(() => {
    const keys = ["archetype", "tone", "audience", "values", "phrases", "style"];
    return keys.some((key) => (draftBrand?.[key] || "") !== (brand?.[key] || ""));
  }, [draftBrand, brand]);

  const contentChanged = useMemo(() => {
    if (draftContentPreferences.length !== contentPreferences.length) {
      return true;
    }
    const a = [...draftContentPreferences].sort();
    const b = [...contentPreferences].sort();
    return a.some((value, idx) => value !== b[idx]);
  }, [draftContentPreferences, contentPreferences]);

  const isDirty = brandChanged || contentChanged;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSave = async () => {
    if (!isDirty || !onSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (brandChanged && webhooks?.brandProfile) {
        const sessionId = ensureSessionId ? ensureSessionId() : undefined;
        await postWebhook(webhooks.brandProfile, "brand_save_click", {
          brand: draftBrand,
          sessionId,
        });
      }
      await onSave({
        brand: draftBrand,
        contentPreferences: draftContentPreferences,
      });
      setLastSavedAt(new Date());
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof Error ? error.message : "Unable to save settings"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!onReset || saving) return;
    const confirmReset = window.confirm(
      "Reset your saved settings? This will clear your brand voice and content preferences."
    );
    if (!confirmReset) return;
    onReset();
    onDirtyChange?.(false);
    setSaveError(null);
    setLastSavedAt(null);
  };

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Settings</h2>
      </header>
      <div className="overflow-hidden rounded-2xl border border-[#232941] bg-[#121629]">
        <div className="flex flex-wrap gap-2 border-b border-[#232941] px-4 pt-4 pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-white text-[#0b1020]"
                  : "bg-[#1a2037] text-slate-300 hover:bg-[#1f2745]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-4 pb-6 pt-4">
          {activeTab === "content" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Your content mix</h3>
                <p className="mt-1 text-sm text-slate-300">
                  What type of content do you make? Pick all that apply.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {contentOptions.map((option) => {
                  const selected = draftContentPreferences.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleContentPreference(option)}
                      className={`rounded-full border px-4 py-1 text-sm transition ${
                        selected
                          ? "border-white bg-white text-[#0b1020]"
                          : "border-[#2a3357] bg-[#0f1427] text-slate-200 hover:border-white/40"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {draftContentPreferences.length > 0 && (
                <div className="rounded-xl border border-dashed border-[#2a3357] bg-[#0f1427] p-4 text-sm text-slate-300">
                  <div className="font-semibold text-slate-100">
                    Saved preferences
                  </div>
                  <p className="mt-2 leading-relaxed">
                    You're focused on {draftContentPreferences.join(", ")}.
                    We'll use this to personalize your recommendations once you
                    save.
                  </p>
                </div>
              )}
            </div>
          )}
          {activeTab === "brand" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowBrandDetails((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-[#232941] bg-[#181d35] px-4 py-3 text-left text-sm font-semibold text-slate-200"
              >
                <span>Brand voice details</span>
                <span className="text-lg">{showBrandDetails ? "▾" : "▸"}</span>
              </button>
              {showBrandDetails && (
                <div className="space-y-4 rounded-2xl border border-[#232941] bg-[#0f1427] p-4">
                  <form
                    className="grid gap-4 md:grid-cols-2"
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <label className="flex flex-col gap-2 text-sm">
                      Archetype
                      <select
                        value={draftBrand.archetype}
                        onChange={(e) =>
                          setDraftBrand({
                            ...draftBrand,
                            archetype: e.target.value,
                          })
                        }
                        disabled={brandDisabled}
                        className="rounded-lg border border-[#232941] bg-[#0f1427] px-3 py-2 disabled:opacity-60"
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
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      Tone of Voice
                      <input
                        value={draftBrand.tone}
                        onChange={(e) =>
                          setDraftBrand({
                            ...draftBrand,
                            tone: e.target.value,
                          })
                        }
                        disabled={brandDisabled}
                        placeholder="clear, bold, human…"
                        className="rounded-lg border border-[#232941] bg-[#0f1427] px-3 py-2 disabled:opacity-60"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      Audience
                      <input
                        value={draftBrand.audience}
                        onChange={(e) =>
                          setDraftBrand({
                            ...draftBrand,
                            audience: e.target.value,
                          })
                        }
                        disabled={brandDisabled}
                        placeholder="KBB retailers, UK SMB owners…"
                        className="rounded-lg border border-[#232941] bg-[#0f1427] px-3 py-2 disabled:opacity-60"
                      />
                    </label>
                    <details className="md:col-span-2">
                      <summary className="cursor-pointer py-2 text-sm font-medium text-slate-200">
                        Additional Voice Details
                      </summary>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm md:col-span-2">
                          Values (comma-separated)
                          <input
                            value={draftBrand.values}
                            onChange={(e) =>
                              setDraftBrand({
                                ...draftBrand,
                                values: e.target.value,
                              })
                            }
                            disabled={brandDisabled}
                            placeholder="clarity, control, optimise"
                            className="rounded-lg border border-[#232941] bg-[#0f1427] px-3 py-2 disabled:opacity-60"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm md:col-span-2">
                          Signature Phrases
                          <input
                            value={draftBrand.phrases}
                            onChange={(e) =>
                              setDraftBrand({
                                ...draftBrand,
                                phrases: e.target.value,
                              })
                            }
                            disabled={brandDisabled}
                            placeholder="Model Your Success™, chaos → clarity…"
                            className="rounded-lg border border-[#232941] bg-[#0f1427] px-3 py-2 disabled:opacity-60"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm md:col-span-2">
                          Style Notes
                          <textarea
                            value={draftBrand.style}
                            onChange={(e) =>
                              setDraftBrand({
                                ...draftBrand,
                                style: e.target.value,
                              })
                            }
                            disabled={brandDisabled}
                            rows={4}
                            placeholder="Short sentences, UK spelling…"
                            className="rounded-lg border border-[#232941] bg-[#0f1427] px-3 py-2 disabled:opacity-60"
                          />
                        </label>
                      </div>
                    </details>
                  </form>
                  {brandDisabled && (
                    <p className="text-xs text-slate-400">
                      To update your brand voice, start a new session from the New
                      menu.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {activeTab !== "content" && activeTab !== "brand" && (
            <div className="rounded-2xl border border-dashed border-[#232941] bg-[#0f1427] p-6 text-sm text-slate-300">
              <p>
                Configure your {tabs.find((tab) => tab.id === activeTab)?.label.toLowerCase()} preferences here. We're preparing
                tailored controls for this section.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-col items-end gap-2">
        {saveError ? (
          <p className="text-xs text-red-400">{saveError}</p>
        ) : isDirty ? (
          <p className="text-xs text-amber-300">
            You have unsaved changes. Save before leaving this page.
          </p>
        ) : lastSavedAt ? (
          <p className="text-xs text-slate-400">
            All changes saved{lastSavedAt ? ` at ${lastSavedAt.toLocaleTimeString()}` : ""}.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="rounded-xl border border-[#2a3357] px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-[#1a2037] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset settings
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`rounded-xl px-5 py-2 font-semibold transition ${
              !isDirty || saving
                ? "cursor-not-allowed bg-slate-500/40 text-slate-200"
                : "bg-white text-[#0b1020]"
            }`}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
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
  webhooks,
  ensureSessionId,
  archives,
  onRestoreArchive,
  onDeleteArchive,
  activeArchiveId,
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
    if (webhooks?.topicsContinue) {
      const sessionId = ensureSessionId ? ensureSessionId() : undefined;
      await postWebhook(webhooks.topicsContinue, "topics_continue_click", {
        topics: topicsPayload,
        sessionId,
      });
    }
    nextFromTopics({ pendingTopic, topicsPayload, isEditing });
  };
  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Topics</h2>
        {activeArchiveId && (
          <p className="mt-1 text-sm text-amber-300">
            Viewing an archived session. Any changes you make will update this archive entry automatically.
          </p>
        )}
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
          {webhooks?.topicsContinue}
        </p>
      </div>
      <ArchiveList
        archives={archives}
        onRestoreArchive={(id) => onRestoreArchive?.(id)}
        onDeleteArchive={(id) => {
          if (!onDeleteArchive) return;
          const confirmed = window.confirm(
            "Delete this archived session? This action cannot be undone."
          );
          if (confirmed) {
            onDeleteArchive(id);
          }
        }}
        activeArchiveId={activeArchiveId}
      />
    </section>
  );
}

function SnapshotPage({
  topics,
  snapshot,
  setSnapshot,
  snapshotChatMessages,
  snapshotChatDraft,
  setSnapshotChatDraft,
  snapshotChatSending,
  sendSnapshotChat,
  navTo,
  webhooks,
  brand,
  ensureSessionId,
}) {
  const [generatingSnapshot, setGeneratingSnapshot] = useState(false);
  const chatContainerRef = useRef(null);
  const [draggingSectionId, setDraggingSectionId] = useState(null);
  const [printStamp] = useState(() => new Date());

  useEffect(() => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [snapshotChatMessages]);

  const sectionsWithMeta = useMemo(() => {
    const baseSections =
      snapshot.sections && snapshot.sections.length
        ? snapshot.sections
        : createEmptySnapshotSections();
    return baseSections.map((section) => {
      const definition =
        SNAPSHOT_SECTION_DEFINITIONS.find((def) => def.id === section.id) ?? {
          id: section.id,
          title: section.id,
          helper: "",
          placeholder: "",
          maxChars: null,
          required: false,
        };
      const content = typeof section.content === "string" ? section.content : "";
      const trimmed = content.trim();
      const charCount = content.length;
      const words = trimmed
        ? trimmed
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean)
        : [];
      const wordCount = words.length;
      const limit =
        typeof definition.maxChars === "number" ? definition.maxChars : null;
      const overLimit = limit != null ? charCount > limit : false;
      const nearLimit =
        limit != null ? charCount > limit * 0.9 && !overLimit : false;
      const isComplete = trimmed.length > 0 && !overLimit;
      return {
        ...section,
        definition,
        content,
        trimmed,
        charCount,
        wordCount,
        limit,
        overLimit,
        nearLimit,
        isComplete,
      };
    });
  }, [snapshot.sections]);

  const allRequiredComplete = useMemo(
    () =>
      sectionsWithMeta.every(
        (section) =>
          !section.definition.required || (section.trimmed && section.isComplete)
      ),
    [sectionsWithMeta]
  );

  const handleSectionChange = useCallback(
    (id, value) => {
      setSnapshot((prev) => {
        const nextSections = (
          prev.sections && prev.sections.length
            ? prev.sections
            : createEmptySnapshotSections()
        ).map((section) =>
          section.id === id ? { ...section, content: value } : section
        );
        return {
          ...prev,
          sections: nextSections,
        };
      });
    },
    [setSnapshot]
  );

  const handleSnapshotChatKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!snapshotChatSending) {
        sendSnapshotChat();
      }
    }
  };

  const handleDragStart = useCallback((event, id) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingSectionId(id);
  }, []);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (event, targetId) => {
      event.preventDefault();
      const sourceId =
        draggingSectionId || event.dataTransfer.getData("text/plain");
      setDraggingSectionId(null);
      if (!sourceId || sourceId === targetId) return;
      setSnapshot((prev) => {
        const currentSections =
          prev.sections && prev.sections.length
            ? [...prev.sections]
            : createEmptySnapshotSections();
        const fromIndex = currentSections.findIndex(
          (section) => section.id === sourceId
        );
        const toIndex = currentSections.findIndex(
          (section) => section.id === targetId
        );
        if (fromIndex === -1 || toIndex === -1) return prev;
        const [moved] = currentSections.splice(fromIndex, 1);
        currentSections.splice(toIndex, 0, moved);
        return {
          ...prev,
          sections: currentSections,
        };
      });
    },
    [draggingSectionId, setSnapshot]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingSectionId(null);
  }, []);

  const requestSnapshot = useCallback(async () => {
    if (!webhooks?.snapshotGenerate || generatingSnapshot) return;
    try {
      setGeneratingSnapshot(true);
      const payload = {
        snapshotText: snapshot.text,
        topic: topics[0] ?? null,
        topics,
        brand,
        sessionId: ensureSessionId(),
      };
      const res = await fetch(webhooks.snapshotGenerate, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "snapshot_generate_request",
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      });
      if (!res.ok) throw new Error("HTTP error");
      const rawText = await res.text();
      const extracted = extractSnapshotText(rawText).trim();
      setSnapshot((prev) => ({
        ...prev,
        aiDraft: extracted ? ensureHtmlContent(extracted) : "",
      }));
      alert("Requested delivery snapshot generation ✔︎");
    } catch (error) {
      console.error(error);
      alert("Could not reach the delivery snapshot webhook.");
    } finally {
      setGeneratingSnapshot(false);
    }
  }, [
    webhooks,
    generatingSnapshot,
    snapshot.text,
    topics,
    brand,
    ensureSessionId,
    setSnapshot,
  ]);

  const brandSummary = useMemo(() => {
    if (!brand) return "";
    const fragments = [
      brand.archetype && `Archetype: ${brand.archetype}`,
      brand.audience && `Audience: ${brand.audience}`,
      brand.tone && `Tone: ${brand.tone}`,
      brand.values && `Values: ${brand.values}`,
      brand.phrases && `Phrases: ${brand.phrases}`,
      brand.style && `Style: ${brand.style}`,
    ].filter(Boolean);
    return fragments.join(" • ");
  }, [brand]);

  const formattedPrintDate = useMemo(
    () =>
      printStamp.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [printStamp]
  );

  const previewSections = sectionsWithMeta;

  const statusMessage = allRequiredComplete
    ? "All sections are ready to export."
    : "Complete each section to unlock export and send.";

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-50">Delivery Snapshot</h2>
          <p className="mt-1 text-sm text-slate-300">
            Make each section crisp and scan-friendly before exporting to your team.
          </p>
        </div>
        <div className="print-hidden flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-[#2a3357] bg-[#121629] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
            v{APP_VERSION}
          </span>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.print();
              }
            }}
            className="rounded-xl border border-[#2a3357] bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/20"
          >
            Print Snapshot
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="print-hidden lg:w-64 lg:flex-shrink-0">
          <div className="rounded-2xl border border-[#232941] bg-[#121629] p-5 lg:sticky lg:top-24">
            <h3 className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Section status
            </h3>
            <ol className="mt-4 space-y-4">
              {sectionsWithMeta.map((section) => {
                const complete = section.isComplete;
                const over = section.overLimit;
                return (
                  <li key={section.id} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${
                        complete
                          ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                          : over
                          ? "border-rose-500/40 bg-rose-500/20 text-rose-200"
                          : "border-[#2a3357] bg-[#0f1427] text-slate-300"
                      }`}
                    >
                      {complete ? "✓" : over ? "!" : "•"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {section.definition.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {complete
                          ? "Ready"
                          : over
                          ? "Trim to meet the target"
                          : "Needs input"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-6 text-xs text-slate-400">{statusMessage}</p>
          </div>
        </aside>
        <div className="flex-1 space-y-6">
          {!!topics.length && (
            <div className="rounded-2xl border border-[#232941] bg-[#121629] p-5 shadow-sm">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                    Selected topics
                  </h3>
                  <p className="text-xs text-slate-400">
                    These inform tone, proof points, and context.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navTo("topics")}
                  className="print-hidden rounded-lg border border-[#2a3357] px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-[#151a32]"
                >
                  Change Topic
                </button>
              </div>
              <ul className="grid gap-3 md:grid-cols-2">
                {topics.map((topic) => (
                  <li
                    key={topic.id}
                    className="rounded-xl border border-[#2a3357] bg-[#151a32] p-4"
                  >
                    <div className="font-semibold text-slate-100">{topic.name}</div>
                    {topic.context && (
                      <p className="mt-2 text-sm text-slate-300">{topic.context}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-2xl border border-[#232941] bg-[#121629] p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
                  Delivery Snapshot Draft
                </h3>
                <p className="text-sm text-slate-300">
                  Fill the sections below. We’ll stitch them together for export, print, and change requests.
                </p>
              </div>
              <div className="print-hidden flex flex-col items-start gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={requestSnapshot}
                  disabled={generatingSnapshot || !webhooks?.snapshotGenerate}
                  className="rounded-xl border border-[#2a3357] bg-[#222845] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingSnapshot
                    ? "Requesting…"
                    : "Generate My Delivery Snapshot"}
                </button>
                <p className="break-all text-xs italic text-slate-400">
                  {webhooks?.snapshotGenerate}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {sectionsWithMeta.map((section) => {
              const definition = section.definition;
              const limit = section.limit;
              let badgeTone =
                "border-[#2a3357] bg-[#0f1427] text-slate-200";
              if (section.overLimit) {
                badgeTone = "border-rose-500/40 bg-rose-500/20 text-rose-100";
              } else if (section.nearLimit) {
                badgeTone = "border-amber-500/40 bg-amber-500/20 text-amber-100";
              }
              return (
                <div
                  key={section.id}
                  className={`snapshot-section-card rounded-2xl border border-[#232941] bg-[#121629] p-5 shadow-sm transition ${
                    draggingSectionId === section.id
                      ? "ring-2 ring-[#566fee]/50"
                      : ""
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, section.id)}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="print-hidden mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a3357] bg-[#0f1427] text-slate-300 transition hover:bg-[#151a32]"
                      draggable
                      onDragStart={(event) => handleDragStart(event, section.id)}
                      onDragEnd={handleDragEnd}
                      aria-label={`Reorder ${definition.title}`}
                      title="Drag to reorder"
                    >
                      <Icon.List className="h-4 w-4" />
                    </button>
                    <div className="flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-slate-50">
                            {definition.title}
                          </h3>
                          {definition.helper && (
                            <p className="text-sm text-slate-400">
                              {definition.helper}
                            </p>
                          )}
                        </div>
                        <span
                          className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone}`}
                        >
                          {limit != null
                            ? `${section.charCount}/${limit} chars`
                            : `${section.charCount} chars`}
                        </span>
                      </div>
                      <textarea
                        value={section.content}
                        onChange={(event) =>
                          handleSectionChange(section.id, event.target.value)
                        }
                        rows={definition.id === "actionSteps" ? 5 : 4}
                        placeholder={definition.placeholder}
                        className="mt-4 w-full resize-vertical rounded-xl border border-[#2a3357] bg-[#0f1427] p-4 text-sm leading-relaxed text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#566fee]/50"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span>
                          {section.wordCount} {section.wordCount === 1 ? "word" : "words"}
                        </span>
                        {limit != null && <span>Target ≤ {limit} chars</span>}
                        {section.overLimit ? (
                          <span className="text-rose-300">
                            Over target — trim this section.
                          </span>
                        ) : section.nearLimit ? (
                          <span className="text-amber-200">
                            Approaching the limit.
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="snapshot-preview-card rounded-2xl border border-[#232941] bg-[#121629] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-100">
              Snapshot Preview
            </h3>
            <p className="text-sm text-slate-300">
              Review how the narrative reads before exporting or printing.
            </p>
            <div className="mt-4 space-y-4">
              {previewSections.map((section) => (
                <div
                  key={section.id}
                  className="snapshot-print-card rounded-xl border border-[#2a3357] bg-[#0f1427] p-4"
                >
                  <h4 className="text-base font-semibold text-slate-100">
                    {section.definition.title}
                  </h4>
                  {section.trimmed ? (
                    <div
                      className="mt-2 text-sm leading-relaxed text-slate-200"
                      dangerouslySetInnerHTML={{
                        __html: ensureHtmlContent(section.content),
                      }}
                    />
                  ) : (
                    <p className="mt-2 text-xs italic text-slate-500">
                      Not filled yet.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          {snapshot.aiDraft ? (
            <div className="snapshot-preview-card rounded-2xl border border-[#232941] bg-[#121629] p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    Latest AI Draft
                  </h3>
                  <p className="text-sm text-slate-300">
                    Captured from the generation webhook response.
                  </p>
                </div>
              </div>
              <div
                className="snapshot-print-card mt-4 space-y-3 rounded-xl border border-dashed border-[#2a3357] bg-[#0f1427] p-4 text-sm leading-relaxed text-slate-200"
                dangerouslySetInnerHTML={{ __html: snapshot.aiDraft }}
              />
            </div>
          ) : null}
          <div className="print-hidden rounded-2xl border border-[#232941] bg-[#121629] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-100">
              Request changes to this snapshot
            </h3>
            <p className="text-xs text-slate-400">
              Start a chat with the editing team. Each message is sent to the webhook
              below and replies appear here automatically.
            </p>
            <div
              ref={chatContainerRef}
              className="mt-4 flex h-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-[#2a3357] bg-[#0a0f22] p-3"
            >
              {snapshotChatMessages.length ? (
                snapshotChatMessages.map((message) => {
                  const role = message.role || "assistant";
                  const alignment = role === "user" ? "items-end" : "items-start";
                  let bubbleClasses =
                    "bg-[#121629] border border-[#2a3357] text-slate-200";
                  if (role === "user") {
                    bubbleClasses = "bg-[#222845] text-slate-100";
                  } else if (role === "system") {
                    bubbleClasses =
                      "bg-[#2f1f2f] border border-[#533553] text-rose-100";
                  }
                  return (
                    <div
                      key={message.id || message.timestamp}
                      className={`flex ${alignment}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${bubbleClasses}`}
                      >
                        {message.text}
                      </div>
                      <span className="sr-only">{message.timestamp}</span>
                    </div>
                  );
                })
              ) : (
                <div className="py-10 text-center text-xs text-slate-400">
                  No messages yet. Send a request to get started.
                </div>
              )}
            </div>
            <div className="mt-3">
              <textarea
                value={snapshotChatDraft}
                onChange={(event) => setSnapshotChatDraft(event.target.value)}
                onKeyDown={handleSnapshotChatKeyDown}
                rows={3}
                placeholder="Type your change request… Press Enter to send, or Shift + Enter for a new line."
                className="w-full rounded-xl border border-[#232941] bg-[#0f1427] p-3 text-sm"
              />
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="break-all text-xs text-slate-400 sm:pr-3">
                {webhooks?.snapshotChange}
              </p>
              <button
                onClick={sendSnapshotChat}
                disabled={snapshotChatSending}
                className="rounded-xl bg-white px-4 py-2 font-bold text-[#0b1020] transition disabled:opacity-60"
              >
                {snapshotChatSending ? "Sending…" : "Send message"}
              </button>
            </div>
          </div>
          <div className="print-hidden mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">{statusMessage}</p>
            <button
              onClick={() => navTo("article")}
              disabled={!allRequiredComplete}
              className="rounded-xl bg-white px-4 py-2 font-bold text-[#0b1020] transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Snapshot & Continue →
            </button>
          </div>
        </div>
      </div>
      <div className="snapshot-print-only">
        <h1 className="snapshot-print-title">Delivery Snapshot</h1>
        <p className="snapshot-print-meta">Prepared {formattedPrintDate}</p>
        <div className="snapshot-print-sections">
          {previewSections.map((section) => (
            <div key={section.id} className="snapshot-print-card">
              <h2>{section.definition.title}</h2>
              {section.trimmed ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: ensureHtmlContent(section.content),
                  }}
                />
              ) : (
                <p className="snapshot-print-empty">Not provided.</p>
              )}
            </div>
          ))}
        </div>
        <div className="snapshot-print-footer">
          <strong>Brand Context</strong>
          <div>{brandSummary || "No brand context captured yet."}</div>
        </div>
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
  webhooks,
  ensureSessionId,
}) {
  const handleArticleChangeKeyDown = (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!sendingArticle) {
        sendArticleChange();
      }
    }
  };
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const requestArticle = async () => {
    if (!webhooks?.articleGenerate || generatingArticle) return;
    try {
      setGeneratingArticle(true);
      const ok = await postWebhook(
        webhooks.articleGenerate,
        "article_generate_request",
        {
          articleContent: article.content,
          topics,
          brand,
          sessionId: ensureSessionId ? ensureSessionId() : undefined,
        }
      );
      if (!ok) throw new Error("HTTP error");
      alert("Requested article generation ✔︎");
    } catch (e) {
      console.error(e);
      alert("Could not reach the article webhook.");
    } finally {
      setGeneratingArticle(false);
    }
  };

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold">Article</h2>
      </header>
      <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h3 className="text-lg font-semibold">Article Draft</h3>
          <div className="flex flex-col items-start sm:items-end">
            <button
              type="button"
              onClick={requestArticle}
              disabled={generatingArticle || !webhooks?.articleGenerate}
              className="bg-[#222845] border border-[#2a3357] text-white font-bold px-4 py-2 rounded-xl disabled:opacity-60"
            >
              {generatingArticle ? "Requesting…" : "Generate My Article"}
            </button>
            <p className="mt-1 text-xs italic text-slate-400 text-left sm:text-right">
              {webhooks?.articleGenerate}
            </p>
          </div>
        </div>
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
                    sessionId: ensureSessionId ? ensureSessionId() : undefined,
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
              placeholder="https://your-n8n-host/webhook-test/xxxx"
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

function ShortFormVideosPage({
  social,
  setSocial,
  makeShorts,
  makePolls,
  makeCarousels,
  makeImages,
  makeNewsletters,
  navTo,
  loadSocialSample,
  session,
}) {
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [editingQuestionError, setEditingQuestionError] = useState("");

  const questions = social.questions ?? [];
  const shortsList = social.shorts ?? [];
  const questionSlots = useMemo(
    () => Array.from({ length: 10 }, (_, idx) => questions[idx] ?? null),
    [questions]
  );
  const approvedQuestions = useMemo(
    () => questions.filter((q) => q.status === "approved"),
    [questions]
  );
  const rejectedCount = useMemo(
    () => questions.filter((q) => q.status === "rejected").length,
    [questions]
  );

  const hasShortScripts = useMemo(
    () => shortsList.some((short) => (short?.script ?? "").trim()),
    [shortsList]
  );
  const [showShorts, setShowShorts] = useState(hasShortScripts);

  useEffect(() => {
    if (hasShortScripts) {
      setShowShorts(true);
    }
  }, [hasShortScripts]);

  useEffect(() => {
    if (editingQuestionIndex == null) return;
    if (!questions[editingQuestionIndex]) {
      setEditingQuestionIndex(null);
      setEditingQuestionText("");
      setEditingQuestionError("");
    }
  }, [editingQuestionIndex, questions]);

  const startEditingQuestion = (index) => {
    const target = questions[index];
    if (!target) return;
    setEditingQuestionIndex(index);
    setEditingQuestionText(target.text ?? "");
    setEditingQuestionError("");
  };

  const cancelEditingQuestion = () => {
    setEditingQuestionIndex(null);
    setEditingQuestionText("");
    setEditingQuestionError("");
  };

  const saveEditedQuestion = () => {
    if (editingQuestionIndex == null) return;
    const trimmed = editingQuestionText.trim();
    if (!trimmed) {
      setEditingQuestionError("Question cannot be empty.");
      return;
    }
    setSocial((prev) => {
      const existing = [...(prev.questions ?? [])];
      if (!existing[editingQuestionIndex]) return prev;
      existing[editingQuestionIndex] = {
        ...existing[editingQuestionIndex],
        text: trimmed,
      };
      return { ...prev, questions: existing };
    });
    setEditingQuestionIndex(null);
    setEditingQuestionText("");
    setEditingQuestionError("");
  };

  const updateQuestionStatus = (index, nextStatus) => {
    const target = questions[index];
    if (!target) return;
    const toggledStatus =
      target.status === nextStatus ? "pending" : nextStatus;
    setSocial((prev) => {
      const existing = [...(prev.questions ?? [])];
      if (!existing[index]) return prev;
      existing[index] = { ...existing[index], status: toggledStatus };
      return { ...prev, questions: existing };
    });
  };

  const handleGenerateQuestions = async () => {
    setQuestionError("");
    setScriptsError("");
    setQuestionLoading(true);

    let ok = false;
    let incoming = [];
    try {
      const response = await postWebhookJson(
        WEBHOOKS.socialTopQuestions,
        "social_generate_top_questions",
        {
          sessionId: session?.id ?? null,
          approvedQuestions: approvedQuestions.map((q) => ({
            id: q.id,
            question: q.text,
          })),
          rejectedQuestions: questions
            .filter((q) => q.status === "rejected")
            .map((q) => ({ id: q.id, question: q.text })),
        }
      );
      ok = response.ok;
      if (Array.isArray(response.data?.questions)) {
        incoming = response.data.questions;
      }
    } catch (error) {
      console.error("Generate top questions failed", error);
    }

    if (!incoming.length) {
      incoming = Array.from({ length: 10 }, (_, i) => `Top Question ${i + 1}`);
      setQuestionError(
        "No questions returned from webhook. Loaded placeholder prompts instead."
      );
    } else if (!ok) {
      setQuestionError(
        "Webhook responded with a non-200 status. Questions refreshed with returned data."
      );
    }

    const normalized = incoming
      .map((item, idx) => {
        if (typeof item === "string") {
          return { id: uuid(), text: item, status: "pending" };
        }
        if (item && typeof item === "object") {
          const text =
            typeof item.question === "string"
              ? item.question
              : typeof item.text === "string"
              ? item.text
              : "";
          if (!text) return null;
          return {
            id: item.id || uuid(),
            text,
            status: "pending",
          };
        }
        return null;
      })
      .filter(Boolean);

    setSocial((prev) => {
      const existing = (prev.questions ?? []).filter(
        (q) => q.status !== "rejected"
      );
      const next = [...existing];
      for (const item of normalized) {
        if (next.length >= 10) break;
        next.push(item);
      }
      return { ...prev, questions: next.slice(0, 10) };
    });

    setQuestionLoading(false);
  };

  const handleGenerateShorts = async () => {
    if (!approvedQuestions.length) {
      setScriptsError("Approve at least one question to generate scripts.");
      return;
    }
    setScriptsError("");
    setScriptsLoading(true);

    let ok = false;
    let shortsPayload = [];
    try {
      const response = await postWebhookJson(
        WEBHOOKS.socialShortScripts,
        "social_generate_short_scripts",
        {
          sessionId: session?.id ?? null,
          questions: approvedQuestions.map((q, index) => ({
            id: q.id,
            question: q.text,
            order: index + 1,
          })),
        }
      );
      ok = response.ok;
      if (Array.isArray(response.data?.shorts)) {
        shortsPayload = response.data.shorts;
      }
    } catch (error) {
      console.error("Generate short scripts failed", error);
    }

    if (!shortsPayload.length) {
      shortsPayload = approvedQuestions.map((q, idx) => ({
        title: q.text || `Short ${idx + 1}`,
        script: `Hook: ${q.text}\nBody: Expand on this idea with your unique angle.\nCTA: Invite your audience to take the next step.`,
      }));
      setScriptsError(
        "No scripts returned from webhook. Generated placeholder scripts from your approved questions."
      );
    } else if (!ok) {
      setScriptsError(
        "Webhook responded with a non-200 status. Showing returned scripts where possible."
      );
    }

    const normalized = shortsPayload
      .map((item, idx) => {
        if (typeof item === "string") {
          return {
            title: `Short ${idx + 1}`,
            script: item,
          };
        }
        if (item && typeof item === "object") {
          const title =
            typeof item.title === "string" && item.title.trim()
              ? item.title
              : typeof item.question === "string"
              ? item.question
              : `Short ${idx + 1}`;
          const script =
            typeof item.script === "string"
              ? item.script
              : typeof item.body === "string"
              ? item.body
              : "";
          return {
            title,
            script,
          };
        }
        return null;
      })
      .filter(Boolean);

    const filled = normalized.slice(0, 10);
    while (filled.length < 10) {
      filled.push({
        title: `Short ${filled.length + 1}`,
        script: "",
      });
    }

    setSocial((prev) => ({
      ...prev,
      shorts: filled,
    }));

    setScriptsLoading(false);
    setShowShorts(true);
  };

  const handleContinueSave = async () => {
    setSaveError("");
    setSaving(true);
    const ok = await postWebhook(
      WEBHOOKS.socialContinueSave,
      "social_continue_save",
      {
        sessionId: session?.id ?? null,
        questions: (social.questions ?? []).map((q, index) => ({
          id: q.id,
          question: q.text,
          status: q.status,
          order: index + 1,
        })),
        shorts: social.shorts,
      }
    );
    if (!ok) {
      setSaveError(
        "Unable to reach webhook. Continuing without syncing to the webhook."
      );
    }
    setSaving(false);
    navTo("polls");
  };

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Short Form Videos</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              loadSocialSample();
              setShowShorts(true);
            }}
            className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
          >
            Load Sample
          </button>
          <button
            onClick={() => {
              setSocial({
                shorts: makeShorts(),
                polls: makePolls(),
                quote: { text: "", author: "" },
                carousels: makeCarousels(),
                images: makeImages(),
                newsletters: makeNewsletters(),
                questions: [],
              });
              setShowShorts(false);
            }}
            className="bg-[#222845] border border-[#2a3357] px-4 py-2 rounded-xl"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Top Questions</h3>
              <p className="text-xs text-slate-400">
                Approve the ideas you love, reject the rest, and refresh to fill up to 10.
              </p>
            </div>
            <div className="text-xs text-right text-slate-400">
              <p>{questions.length}/10 showing</p>
              <p>{approvedQuestions.length} approved · {rejectedCount} rejected</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleGenerateQuestions}
              disabled={questionLoading}
              className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {questionLoading ? "Generating…" : "Generate Top Questions"}
            </button>
            {questionError && (
              <span className="text-xs text-rose-400 self-center">
                {questionError}
              </span>
            )}
          </div>
          <ol className="mt-4 space-y-3 list-decimal pl-6">
            {questionSlots.map((q, idx) => {
              const status = q?.status ?? "pending";
              const baseClasses =
                "border rounded-xl p-3 bg-[#151a32] transition-colors";
              const statusClasses = q
                ? status === "approved"
                  ? "border-emerald-500/60"
                  : status === "rejected"
                  ? "border-rose-500/60 opacity-70"
                  : "border-[#232941]"
                : "border-dashed border-[#232941]/60 text-slate-500 italic";
              return (
                <li key={q?.id ?? idx} className={`${baseClasses} ${statusClasses}`}>
                  {q ? (
                    <>
                      {editingQuestionIndex === idx ? (
                        <div className="space-y-3">
                          <label className="block text-xs uppercase tracking-wide text-slate-400">
                            Edit question
                            <textarea
                              value={editingQuestionText}
                              onChange={(event) => {
                                setEditingQuestionText(event.target.value);
                                if (editingQuestionError) {
                                  setEditingQuestionError("");
                                }
                              }}
                              rows={3}
                              className="mt-1 w-full bg-[#0f1427] border border-[#232941] rounded-xl p-2 text-sm"
                            />
                          </label>
                          {editingQuestionError && (
                            <p className="text-xs text-rose-400">{editingQuestionError}</p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs">
                            <button
                              type="button"
                              onClick={saveEditedQuestion}
                              className="bg-white text-[#0b1020] font-semibold px-3 py-1.5 rounded-lg"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingQuestion}
                              className="border border-[#2a3357] px-3 py-1.5 rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-sm leading-relaxed">
                            {q.text}
                          </p>
                          <button
                            type="button"
                            onClick={() => startEditingQuestion(idx)}
                            className="text-xs border border-[#2a3357] px-2 py-1 rounded-lg text-slate-300 hover:bg-[#1a2037]"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-4 text-xs">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-500"
                            checked={status === "approved"}
                            onChange={() => updateQuestionStatus(idx, "approved")}
                          />
                          Approve
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-rose-500"
                            checked={status === "rejected"}
                            onChange={() => updateQuestionStatus(idx, "rejected")}
                          />
                          Reject
                        </label>
                        <span className="text-slate-400">
                          {status === "pending" ? "Pending" : status === "approved" ? "Approved" : "Rejected"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p>Empty slot – generate more questions.</p>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleGenerateShorts}
              disabled={scriptsLoading || !approvedQuestions.length}
              className="bg-[#2b3357] border border-[#39406b] px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {scriptsLoading
                ? "Generating scripts…"
                : "Generate My Short Video Scripts"}
            </button>
            {scriptsError && (
              <span className="text-xs text-amber-300 self-center">
                {scriptsError}
              </span>
            )}
          </div>
        </div>

        {showShorts && (
          <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">10 Shorts Video Scripts</h3>
              <span className="text-xs text-slate-400">
                {shortsList.length}/10
              </span>
            </div>
            <ol className="space-y-3 list-decimal pl-6">
              {shortsList.map((s, i) => (
                <li
                  key={i}
                  className="bg-[#151a32] border border-[#232941] rounded-xl p-3"
                >
                  <input
                    value={s.title}
                    onChange={(e) => {
                      const n = [...shortsList];
                      n[i] = { ...n[i], title: e.target.value };
                      setSocial({ ...social, shorts: n });
                    }}
                    placeholder={"Title for Short #" + (i + 1)}
                    className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 mb-2"
                  />
                  <textarea
                    value={s.script}
                    onChange={(e) => {
                      const n = [...shortsList];
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
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <div className="flex flex-col items-end gap-2">
          {saveError && (
            <span className="text-xs text-rose-400">{saveError}</span>
          )}
          <button
            onClick={handleContinueSave}
            disabled={saving}
            className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Continue & Save"}
          </button>
        </div>
      </div>
    </section>
  );
}

function PollsPage({ social, setSocial, makePolls, loadSocialSample, navTo }) {
  const pollsList = useMemo(() => {
    const base = Array.isArray(social.polls) ? [...social.polls] : [];
    const filled = base.slice(0, 5);
    while (filled.length < 5) {
      filled.push({ question: "", options: ["", "", "", ""] });
    }
    return filled.map((poll) => ({
      question: poll?.question ?? "",
      options: Array.from({ length: 4 }, (_, i) => poll?.options?.[i] ?? ""),
    }));
  }, [social.polls]);

  const ensurePollState = (updater) => {
    setSocial((prev) => {
      const next = { ...prev };
      const polls = Array.isArray(prev.polls) ? [...prev.polls] : makePolls();
      while (polls.length < 5) {
        polls.push({ question: "", options: ["", "", "", ""] });
      }
      updater(polls);
      next.polls = polls.map((poll) => ({
        question: poll?.question ?? "",
        options: Array.from({ length: 4 }, (_, i) => poll?.options?.[i] ?? ""),
      }));
      return next;
    });
  };

  const updatePollQuestion = (index, question) => {
    ensurePollState((polls) => {
      polls[index] = {
        ...(polls[index] ?? { options: ["", "", "", ""] }),
        question,
      };
    });
  };

  const updatePollOption = (pollIndex, optionIndex, value) => {
    ensurePollState((polls) => {
      const current = polls[pollIndex] ?? { question: "", options: ["", "", "", ""] };
      const options = Array.from({ length: 4 }, (_, i) => current.options?.[i] ?? "");
      options[optionIndex] = value;
      polls[pollIndex] = { ...current, options };
    });
  };

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Polls</h2>
        <div className="flex gap-2">
          <button
            onClick={() => ensurePollState((polls) => {
              const reset = makePolls();
              for (let i = 0; i < polls.length; i += 1) {
                polls[i] = reset[i] ?? { question: "", options: ["", "", "", ""] };
              }
            })}
            className="px-4 py-2 rounded-xl border border-[#2a3357] bg-[#151a32] text-sm font-semibold"
          >
            Reset Polls
          </button>
          <button
            onClick={loadSocialSample}
            className="px-4 py-2 rounded-xl border border-[#2a3357] bg-white text-[#0b1020] text-sm font-semibold"
          >
            Load Example
          </button>
        </div>
      </header>
      <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <ol className="space-y-4 list-decimal pl-6">
          {pollsList.map((poll, pollIndex) => (
            <li
              key={pollIndex}
              className="bg-[#151a32] border border-[#232941] rounded-xl p-4"
            >
              <input
                value={poll.question}
                onChange={(event) => updatePollQuestion(pollIndex, event.target.value)}
                placeholder={`Poll question #${pollIndex + 1}`}
                className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 text-sm"
              />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {poll.options.map((option, optionIndex) => (
                  <input
                    key={optionIndex}
                    value={option}
                    onChange={(event) =>
                      updatePollOption(pollIndex, optionIndex, event.target.value)
                    }
                    placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                    className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 text-sm"
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => navTo("images")}
          className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
        >
          Continue →
        </button>
      </div>
    </section>
  );
}

function ImagePostsPage({ social, setSocial, makeImages, loadSocialSample, navTo }) {
  const imagesList = useMemo(() => {
    const base = Array.isArray(social.images) ? [...social.images] : [];
    const filled = base.slice(0, 6);
    while (filled.length < 6) {
      filled.push({ caption: "", alt: "", postCaption: "" });
    }
    return filled.map((image) => ({
      caption: image?.caption ?? "",
      alt: image?.alt ?? "",
      postCaption: image?.postCaption ?? "",
    }));
  }, [social.images]);

  const updateImage = (index, nextImage) => {
    setSocial((prev) => {
      const next = { ...prev };
      const images = Array.isArray(prev.images) ? [...prev.images] : makeImages();
      while (images.length < 6) {
        images.push({ caption: "", alt: "", postCaption: "" });
      }
      images[index] = {
        caption: nextImage.caption ?? "",
        alt: nextImage.alt ?? "",
        postCaption: nextImage.postCaption ?? "",
      };
      next.images = images;
      return next;
    });
  };

  const handleGenerate = () => {
    setSocial((prev) => ({
      ...prev,
      images: makeImages(),
    }));
  };

  return (
    <section className="min-h-screen px-[7vw] py-16">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Image Posts</h2>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            className="px-4 py-2 rounded-xl border border-[#2a3357] bg-white text-[#0b1020] text-sm font-semibold"
          >
            Generate Posts
          </button>
          <button
            onClick={loadSocialSample}
            className="px-4 py-2 rounded-xl border border-[#2a3357] bg-[#151a32] text-sm font-semibold"
          >
            Load Example
          </button>
        </div>
      </header>
      <div className="bg-[#121629] border border-[#232941] rounded-2xl p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {imagesList.map((image, index) => (
            <div
              key={index}
              className="border border-[#232941] rounded-2xl bg-[#151a32] p-4 flex flex-col gap-3"
            >
              <div className="aspect-square rounded-xl border border-dashed border-[#2a3357] bg-[#0f1427] grid place-items-center text-xs uppercase tracking-widest text-slate-500">
                Image Placeholder
              </div>
              <input
                value={image.caption}
                onChange={(event) =>
                  updateImage(index, { ...image, caption: event.target.value })
                }
                placeholder={`Caption ${index + 1}`}
                className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={image.alt}
                onChange={(event) =>
                  updateImage(index, { ...image, alt: event.target.value })
                }
                placeholder="Alt text / description"
                className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 text-sm"
              />
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Social Media Caption
                </span>
                <textarea
                  value={image.postCaption}
                  onChange={(event) =>
                    updateImage(index, {
                      ...image,
                      postCaption: event.target.value,
                    })
                  }
                  rows={3}
                  placeholder="Write the caption that will accompany this post"
                  className="w-full bg-[#0f1427] border border-[#232941] rounded-lg px-3 py-2 text-sm leading-relaxed"
                />
              </label>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => navTo("podcast")}
          className="bg-white text-[#0b1020] font-bold px-4 py-2 rounded-xl"
        >
          Continue →
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
  const displayVersion = useMemo(() => {
    if (!APP_VERSION || APP_VERSION === "dev") return "dev";
    return APP_VERSION;
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);
  // navigation (hash-style to keep canvas happy)
  const getViewFromHash = () => {
    if (typeof window === "undefined") return FLOW_ORDER[0];
    const hash = window.location?.hash
      ? window.location.hash.slice(1)
      : "";
    if (hash === "settings") return "settings";
    return FLOW_ORDER.includes(hash) ? hash : FLOW_ORDER[0];
  };

  const [view, setView] = useState(getViewFromHash);
  useEffect(() => {
    const onHash = () => {
      const nextView = getViewFromHash();
      if (view === "settings" && nextView !== "settings" && hasUnsavedSettings) {
        const allow = window.confirm(
          "You have unsaved settings. Leave without saving?"
        );
        if (!allow) {
          window.location.hash = "settings";
          return;
        }
        setHasUnsavedSettings(false);
      }
      setView(nextView);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view, hasUnsavedSettings]);
  const navTo = (v) => {
    if (v === view) return;
    if (view === "settings" && v !== "settings" && hasUnsavedSettings) {
      const allow = window.confirm(
        "You have unsaved settings. Leave without saving?"
      );
      if (!allow) {
        try {
          window.location.hash = "settings";
        } catch {}
        return;
      }
      setHasUnsavedSettings(false);
    }
    window.location.hash = v;
    setView(v);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedSettings) return;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedSettings]);

  // state
  const [session, setSession] = useLocal("contentos.session", {
    id: "",
    startedAt: "",
  });

  const [locks, setLocks] = useLocal("contentos.locks", {
    brand: false,
  });
  const [showWelcome, setShowWelcome] = useState(false);
  const [showNewBuildConfirm, setShowNewBuildConfirm] = useState(false);
  const skipNextWelcomeRef = useRef(false);
  useEffect(() => {
    if (!session.id) {
      if (skipNextWelcomeRef.current) {
        skipNextWelcomeRef.current = false;
        return;
      }
      setShowWelcome(true);
    }
  }, [session.id]);
  const [refdata, setRefdata] = useLocal("contentos.refdata", {
    headers: [],
    rows: [],
  });
  const [brand, setBrand] = useLocal("contentos.brand", createDefaultBrand());
  const [contentPreferences, setContentPreferences] = useLocal(
    "contentos.contentTypes",
    createDefaultContentPreferences()
  );
  const [topics, setTopics] = useLocal("contentos.topics", []);
  useEffect(() => {
    if (topics.length > 1) {
      setTopics([topics[0]]);
    }
  }, [topics, setTopics]);
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [tempTopic, setTempTopic] = useState("");
  const [tempContext, setTempContext] = useState("");
  const [snapshotState, setSnapshotState] = useLocal(
    "contentos.snapshot",
    finalizeSnapshot(createEmptySnapshotState())
  );
  const snapshot = useMemo(
    () => finalizeSnapshot(snapshotState),
    [snapshotState]
  );
  const setSnapshot = useCallback(
    (updater) =>
      setSnapshotState((prev) => {
        const base = finalizeSnapshot(prev);
        const nextValue =
          typeof updater === "function" ? updater(base) : updater;
        return finalizeSnapshot(nextValue);
      }),
    [setSnapshotState]
  );
  const [snapshotChatMessages, setSnapshotChatMessages] = useLocal(
    "contentos.snapshot.chat",
    []
  );
  const [article, setArticle] = useLocal("contentos.article", {
    content: "",
    savedAt: null,
  });
  const [podcast, setPodcast] = useLocal("contentos.podcast", {
    title: "",
    outline: "",
  });
  const [n8n, setN8N] = useLocal("contentos.n8n", { webhook: "" });
  const [snapshotChatDraft, setSnapshotChatDraft] = useState("");
  const [snapshotChatSending, setSnapshotChatSending] = useState(false);

  // social presets
  const makeShorts = () =>
    Array.from({ length: 10 }, (_, i) => ({
      title: `Short #${i + 1}`,
      script: "",
    }));
  const makePolls = () =>
    Array.from({ length: 5 }, (_, i) => ({
      question: `Poll question #${i + 1}`,
      options: ["Option A", "Option B", "Option C", "Option D"],
    }));
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
    Array.from({ length: 6 }, (_, i) => ({
      caption: `Image post #${i + 1}`,
      alt: "Describe the visual",
      postCaption: "Share the story behind the visual",
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
    questions: [],
  });

  const [archives, setArchives] = useLocal(TOPIC_ARCHIVE_STORAGE_KEY, []);
  const [activeArchiveId, setActiveArchiveId] = useState(null);
  const archiveSyncRef = useRef(null);

  const persistSessionToArchive = useCallback(
    ({ entryId, dataOverride } = {}) => {
      if (!session?.id) return null;
      const archiveData =
        dataOverride || {
          brand,
          contentPreferences,
          topics,
          snapshot,
          snapshotChatMessages,
          article,
          podcast,
          social,
          refdata,
          n8n,
          locks,
        };
      const topicList = Array.isArray(archiveData.topics)
        ? archiveData.topics
        : [];
      const hasTopic = topicList.some(
        (topic) => typeof topic?.name === "string" && topic.name.trim().length
      );
      if (!hasTopic) return null;

      const title = topicList[0]?.name?.trim() || "Untitled topic";
      let createdEntry = null;
      setArchives((prev) => {
        const index = prev.findIndex((item) =>
          entryId ? item.id === entryId : item.sessionId === session.id
        );
        const baseEntry = {
          id:
            entryId || (index >= 0 ? prev[index].id : uuid()),
          sessionId: session.id,
          startedAt: session.startedAt || "",
          savedAt: new Date().toISOString(),
          title,
          data: archiveData,
        };
        if (index >= 0) {
          const existing = prev[index];
          const existingPayload = JSON.stringify(existing.data);
          const nextPayload = JSON.stringify(archiveData);
          if (existingPayload === nextPayload && existing.title === title) {
            createdEntry = existing;
            return prev;
          }
          const next = [...prev];
          const updated = { ...existing, ...baseEntry };
          next[index] = updated;
          createdEntry = updated;
          return next;
        }
        createdEntry = baseEntry;
        return [baseEntry, ...prev];
      });
      return createdEntry;
    },
    [
      session,
      brand,
      contentPreferences,
      topics,
      snapshot,
      snapshotChatMessages,
      article,
      podcast,
      social,
      refdata,
      n8n,
      locks,
      setArchives,
    ]
  );

  const startNewSession = useCallback(() => {
    persistSessionToArchive();
    setActiveArchiveId(null);
    archiveSyncRef.current = null;
    const id = uuid();
    const startedAt = new Date().toISOString();
    setSession({ id, startedAt });
    setLocks({ brand: false });
    (async () => {
      try {
        const ok = await postWebhook(WEBHOOKS.startSession, "session_start", {
          sessionId: id,
          startedAt,
        });
        if (!ok) {
          console.error("Session start webhook responded with non-200");
        }
      } catch (err) {
        console.error("Session start webhook failed:", err);
      }
    })();
    return id;
  }, [persistSessionToArchive, setSession, setLocks]);

  const ensureSessionId = useCallback(() => {
    if (session.id) return session.id;
    return startNewSession();
  }, [session.id, startNewSession]);

  const handleRestoreArchive = useCallback(
    (entryId) => {
      const entry = archives.find((item) => item.id === entryId);
      if (!entry) return;
      const data = entry.data || {};
      setSession({
        id: entry.sessionId,
        startedAt: entry.startedAt || "",
      });
      setBrand(data.brand || createDefaultBrand());
      setContentPreferences(
        data.contentPreferences || createDefaultContentPreferences()
      );
      setTopics(data.topics || []);
      setEditingTopicId(null);
      setTempTopic("");
      setTempContext("");
      setSnapshot(data.snapshot || createEmptySnapshotState());
      setSnapshotChatMessages(data.snapshotChatMessages || []);
      setArticle(
        data.article || {
          content: "",
          savedAt: null,
        }
      );
      setPodcast(
        data.podcast || {
          title: "",
          outline: "",
        }
      );
      setSocial(
        data.social || {
          shorts: makeShorts(),
          polls: makePolls(),
          quote: { text: "", author: "" },
          carousels: makeCarousels(),
          images: makeImages(),
          newsletters: makeNewsletters(),
          questions: [],
        }
      );
      setRefdata(data.refdata || { headers: [], rows: [] });
      setN8N(data.n8n || { webhook: "" });
      setLocks(data.locks || { brand: false });
      setSnapshotChatDraft("");
      setSnapshotChatSending(false);
      setHasUnsavedSettings(false);
      setActiveArchiveId(entry.id);
      archiveSyncRef.current = null;
      setShowWelcome(false);
    },
    [
      archives,
      setSession,
      setBrand,
      setContentPreferences,
      setTopics,
      setEditingTopicId,
      setTempTopic,
      setTempContext,
      setSnapshot,
      setSnapshotChatMessages,
      setArticle,
      setPodcast,
      setSocial,
      setRefdata,
      setN8N,
      setLocks,
      setSnapshotChatDraft,
      setSnapshotChatSending,
      setHasUnsavedSettings,
      setShowWelcome,
      makeShorts,
      makePolls,
      makeCarousels,
      makeImages,
      makeNewsletters,
    ]
  );

  const handleDeleteArchive = useCallback(
    (entryId) => {
      setArchives((prev) => prev.filter((entry) => entry.id !== entryId));
      if (activeArchiveId === entryId) {
        setActiveArchiveId(null);
        archiveSyncRef.current = null;
      }
    },
    [setArchives, activeArchiveId]
  );

  useEffect(() => {
    if (!activeArchiveId) return;
    const entryExists = archives.some((entry) => entry.id === activeArchiveId);
    if (!entryExists) return;
    const archivePayload = {
      brand,
      contentPreferences,
      topics,
      snapshot,
      snapshotChatMessages,
      article,
      podcast,
      social,
      refdata,
      n8n,
      locks,
    };
    const serialized = JSON.stringify(archivePayload);
    if (archiveSyncRef.current === serialized) return;
    archiveSyncRef.current = serialized;
    persistSessionToArchive({
      entryId: activeArchiveId,
      dataOverride: archivePayload,
    });
  }, [
    activeArchiveId,
    archives,
    brand,
    contentPreferences,
    topics,
    snapshot,
    snapshotChatMessages,
    article,
    podcast,
    social,
    refdata,
    n8n,
    locks,
    persistSessionToArchive,
  ]);

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
  const saveBrand = async (brandInput = brand, { navigate = false } = {}) => {
    if (!brandInput.archetype || !brandInput.tone) {
      alert("Please select an archetype and set your tone to continue.");
      throw new Error("Brand details incomplete");
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
    storageDump["contentos.brand"] = brandInput;
    const payload = {
      type: "brand_profile",
      source: "contentos.app",
      brand: brandInput,
      sessionId: ensureSessionId(),
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
      if (navigate) navTo("topics");
    } catch (err) {
      console.error("Brand webhook failed:", err);
      const proceed = window.confirm(
        "Could not reach n8n. Mark your brand voice as saved anyway?"
      );
      if (proceed) {
        setLocks((l) => ({ ...l, brand: true }));
        if (navigate) navTo("topics");
      } else {
        throw err;
      }
    }
  };

  const handleSaveSettings = async ({
    brand: nextBrand,
    contentPreferences: nextContentPreferences,
  }) => {
    const brandKeys = [
      "archetype",
      "tone",
      "audience",
      "values",
      "phrases",
      "style",
    ];
    const brandChanged = brandKeys.some(
      (key) => (nextBrand?.[key] || "") !== (brand?.[key] || "")
    );
    const contentChanged = (() => {
      if (nextContentPreferences.length !== contentPreferences.length) {
        return true;
      }
      const a = [...nextContentPreferences].sort();
      const b = [...contentPreferences].sort();
      return a.some((value, idx) => value !== b[idx]);
    })();

    if (!brandChanged && !contentChanged) {
      return;
    }

    if (brandChanged) {
      await saveBrand(nextBrand);
      setBrand(nextBrand);
    }
    if (contentChanged) {
      setContentPreferences(nextContentPreferences);
    }

    if (brandChanged || contentChanged) {
      setHasUnsavedSettings(false);
    }
  };

  const resetSettings = () => {
    setBrand(createDefaultBrand());
    setContentPreferences(createDefaultContentPreferences());
    setLocks((locks) => ({ ...locks, brand: false }));
    setHasUnsavedSettings(false);
    try {
      SETTINGS_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {}
  };

  // snapshot/article change requests
  const sendSnapshotChat = async () => {
    if (snapshotChatSending) return;
    const trimmed = snapshotChatDraft.trim();
    if (!trimmed) {
      alert("Please type a message before sending.");
      return;
    }

    const userMessage = {
      id: uuid(),
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    let historyForWebhook = [];
    setSnapshotChatMessages((prev) => {
      historyForWebhook = [...prev, userMessage];
      return historyForWebhook;
    });
    if (!historyForWebhook.length) {
      historyForWebhook = [userMessage];
    }
    setSnapshotChatDraft("");
    setSnapshotChatSending(true);

    try {
      const response = await fetch(WEBHOOKS.snapshotChange, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "snapshot_change_chat",
          timestamp: new Date().toISOString(),
          message: trimmed,
          history: historyForWebhook.map(({ role, text, timestamp }) => ({
            role,
            text,
            timestamp,
          })),
          snapshotText: snapshot.text,
          topics,
          brand,
          sessionId: ensureSessionId(),
        }),
      });

      if (!response.ok) throw new Error("HTTP error");

      const replyText = (await response.text()).trim();
      if (replyText) {
        setSnapshotChatMessages((prev) => [
          ...prev,
          {
            id: uuid(),
            role: "assistant",
            text: replyText,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (e) {
      console.error(e);
      setSnapshotChatMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "system",
          text: "Sorry, we couldn't send your request. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSnapshotChatSending(false);
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
        sessionId: ensureSessionId(),
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
  const resetSession = ({ showWelcomeOverlay = true } = {}) => {
    if (!showWelcomeOverlay) {
      skipNextWelcomeRef.current = true;
    }
    try {
      const toDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k?.startsWith("contentos.") &&
          !SETTINGS_STORAGE_KEYS.includes(k)
        ) {
          toDelete.push(k);
        }
      }
      toDelete.forEach((k) => localStorage.removeItem(k));
    } catch {}
    setSession({ id: "", startedAt: "" });
    setLocks({ brand: false });
    setTopics([]);
    setTempTopic("");
    setTempContext("");
    setSnapshot(createEmptySnapshotState());
    setSnapshotChatMessages([]);
    setSnapshotChatDraft("");
    setSnapshotChatSending(false);
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
    setView("topics");
    try {
      window.location.hash = "topics";
    } catch {}
    setHasUnsavedSettings(false);
    setShowWelcome(showWelcomeOverlay);
    return true;
  };

  const requestNewSession = () => {
    if (view === "settings" && hasUnsavedSettings) {
      const allow = window.confirm(
        "You have unsaved settings. Leave without saving?"
      );
      if (!allow) return;
      setHasUnsavedSettings(false);
    }
    setShowNewBuildConfirm(true);
  };

  const flow = FLOW_ORDER;
  const steps = [
    "Topic",
    "Snapshot",
    "Article",
    "Short Form Videos",
    "Polls",
    "Image Posts",
    "Podcast",
  ];
  const views = [
    { id: "topics", label: "Topic", icon: Icon.List },
    { id: "snapshot", label: "Delivery Snapshot", icon: Icon.Camera },
    { id: "article", label: "Article", icon: Icon.Doc },
    { id: "social", label: "Short Form Videos", icon: Icon.Video },
    { id: "polls", label: "Polls", icon: Icon.Poll },
    { id: "images", label: "Image Posts", icon: Icon.Image },
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
            const I = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => navTo(v.id)}
                className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-[#151a32] ${
                  view === v.id ? "bg-[#1a1f3c]" : ""
                }`}
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
                settings: "Settings",
                topics: "Topic",
                snapshot: "Delivery Snapshot",
                article: "Article",
                social: "Short Form Videos",
                polls: "Polls",
                images: "Image Posts",
                podcast: "Podcast Script",
              })[view] ?? "ContentOS"}
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-200/80">
            <button
              onClick={() => {
                navTo("settings");
                setSidebarOpen(false);
              }}
              className={`px-3 py-1 rounded-lg border border-[#2a3357] hover:bg-[#151a32] ${
                view === "settings" ? "bg-[#151a32]" : ""
              }`}
            >
              Settings
            </button>
            <button
              onClick={requestNewSession}
              className="px-3 py-1 rounded-lg border border-[#2a3357] hover:bg-[#151a32]"
            >
              New
            </button>
            <span className="text-[11px] uppercase tracking-wide">
              Ver {displayVersion}
            </span>
          </div>
        </div>

        {view !== "settings" && <Stepper current={currentIndex} steps={steps} />}

        {view === "settings" && (
          <SettingsPage
            brand={brand}
            contentPreferences={contentPreferences}
            locks={locks}
            onSave={handleSaveSettings}
            onDirtyChange={setHasUnsavedSettings}
            webhooks={WEBHOOKS}
            ensureSessionId={ensureSessionId}
            onReset={resetSettings}
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
            webhooks={WEBHOOKS}
            ensureSessionId={ensureSessionId}
            archives={archives}
            onRestoreArchive={handleRestoreArchive}
            onDeleteArchive={handleDeleteArchive}
            activeArchiveId={activeArchiveId}
          />
        )}
        {view === "snapshot" && (
          <SnapshotPage
            topics={topics}
            snapshot={snapshot}
            setSnapshot={setSnapshot}
            snapshotChatMessages={snapshotChatMessages}
            snapshotChatDraft={snapshotChatDraft}
            setSnapshotChatDraft={setSnapshotChatDraft}
            snapshotChatSending={snapshotChatSending}
            sendSnapshotChat={sendSnapshotChat}
            navTo={navTo}
            webhooks={WEBHOOKS}
            brand={brand}
            ensureSessionId={ensureSessionId}
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
            webhooks={WEBHOOKS}
            ensureSessionId={ensureSessionId}
          />
        )}
        {view === "social" && (
          <ShortFormVideosPage
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
                questions: [
                  {
                    id: uuid(),
                    text: "What is the biggest mindset shift you made to post consistently?",
                    status: "pending",
                  },
                  {
                    id: uuid(),
                    text: "How do you batch content ideas without burning out?",
                    status: "pending",
                  },
                  {
                    id: uuid(),
                    text: "What would you tell someone who hasn't posted in 30 days?",
                    status: "pending",
                  },
                  {
                    id: uuid(),
                    text: "Which platform brings you the most engaged leads right now?",
                    status: "pending",
                  },
                  {
                    id: uuid(),
                    text: "What's your go-to CTA when you want direct responses?",
                    status: "pending",
                  },
                ],
                polls: cloneSamplePolls(),
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
                images: cloneSampleImages(),
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
            session={session}
          />
        )}
        {view === "polls" && (
          <PollsPage
            social={social}
            setSocial={setSocial}
            makePolls={makePolls}
            loadSocialSample={() =>
              setSocial((prev) => ({
                ...prev,
                polls: cloneSamplePolls(),
              }))
            }
            navTo={navTo}
          />
        )}
        {view === "images" && (
          <ImagePostsPage
            social={social}
            setSocial={setSocial}
            makeImages={makeImages}
            loadSocialSample={() =>
              setSocial((prev) => ({
                ...prev,
                images: cloneSampleImages(),
              }))
            }
            navTo={navTo}
          />
        )}
        {view === "podcast" && (
          <PodcastPage podcast={podcast} setPodcast={setPodcast} />
        )}
        {showWelcome && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#06091a]/70 backdrop-blur-sm">
            <div className="max-w-xl w-full space-y-4 rounded-3xl border border-[#232941] bg-[#121629] p-6 shadow-2xl">
              <header className="space-y-1">
                <p className="text-xs uppercase tracking-[0.25em] text-indigo-300/80">
                  ContentOS
                </p>
                <h2 className="text-2xl font-semibold">Welcome back</h2>
                <p className="text-sm text-slate-300">
                  Start a fresh session to capture your brand voice and ship a new content drop. You can always come back here by using the New button in the header.
                </p>
              </header>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowWelcome(false)}
                  className="order-2 rounded-xl border border-[#2a3357] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-[#151a32] sm:order-1"
                >
                  Keep exploring
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startNewSession();
                    setShowWelcome(false);
                    setSidebarOpen(false);
                    navTo("topics");
                  }}
                  className="order-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0b1020] transition hover:bg-slate-100 sm:order-2"
                >
                  Start new build
                </button>
              </div>
            </div>
          </div>
        )}
        {showNewBuildConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#06091a]/70 backdrop-blur-sm">
            <div className="max-w-xl w-full space-y-4 rounded-3xl border border-[#232941] bg-[#121629] p-6 shadow-2xl">
              <header className="space-y-1">
                <p className="text-xs uppercase tracking-[0.25em] text-indigo-300/80">
                  ContentOS
                </p>
                <h2 className="text-2xl font-semibold">Start a new build?</h2>
                <p className="text-sm text-slate-300">
                  This clears your current topics, delivery snapshot, content drafts, and integrations so you can begin fresh with new content. Are you sure you want to continue?
                </p>
              </header>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewBuildConfirm(false)}
                  className="order-2 rounded-xl border border-[#2a3357] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-[#151a32] sm:order-1"
                >
                  Keep current session
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const didReset = resetSession({
                      showWelcomeOverlay: false,
                    });
                    if (!didReset) return;
                    startNewSession();
                    setShowNewBuildConfirm(false);
                    setSidebarOpen(false);
                    navTo("topics");
                  }}
                  className="order-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0b1020] transition hover:bg-slate-100 sm:order-2"
                >
                  Yes, start fresh
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <ContentOSApp />;
}
