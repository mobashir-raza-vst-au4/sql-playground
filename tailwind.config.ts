import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d1117",
        panel: "#161b22",
        panel2: "#1c2330",
        border: "#2d333b",
        accent: "#3b82f6",
        accent2: "#8b5cf6",
        good: "#22c55e",
        bad: "#ef4444",
        warn: "#f59e0b",
        muted: "#8b949e",
        text: "#e6edf3",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
