import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SQL Playground — learn, run & visualize SQL online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 60%, #1c2330 100%)",
          color: "#e6edf3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 22,
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 54,
            }}
          >
            🗄️
          </div>
          <div style={{ fontSize: 64, fontWeight: 700 }}>SQL Playground</div>
        </div>
        <div style={{ fontSize: 40, color: "#93c5fd", marginBottom: 20 }}>
          Learn, run &amp; visualize SQL — in your browser
        </div>
        <div style={{ fontSize: 28, color: "#8b949e", maxWidth: 900, lineHeight: 1.4 }}>
          Real PostgreSQL, SQLite &amp; MySQL · animated JOIN visualizer · AI tutor · free, no signup
        </div>
      </div>
    ),
    size
  );
}
