import React from "react";

export default function WelcomeOverlay({ onSkip, onCreate }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0b1020",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(680px, 92vw)",
          padding: 28,
          borderRadius: 20,
          border: "1px solid #232941",
          background:
            "linear-gradient(180deg, rgba(19,27,61,.85), rgba(11,16,32,.85))",
          boxShadow: "0 20px 80px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #4fc3f7, #0288d1)",
              boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            }}
          />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
              Welcome to Content Builder
            </h1>
            <div style={{ opacity: 0.8, fontSize: 14 }}>
              You’re good to go. Click below to start creating.
            </div>
          </div>
        </div>

        <ul style={{ opacity: 0.9, lineHeight: 1.7, margin: "0 0 18px 18px" }}>
          <li>Keep your Brand → Topics → Snapshot → Article → Social → Podcast flow</li>
          <li>Start fresh any time with the New button in the header</li>
        </ul>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              onSkip?.();
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #3a446e",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Skip
          </button>
          <button
            onClick={() => {
              onCreate?.();
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid #0b1020",
              background: "#fff",
              color: "#0b1020",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Let’s Get Creating →
          </button>
        </div>
      </div>
    </div>
  );
}
