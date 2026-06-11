import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        arc: "#00E5FF",
        energy: "#00FFFF",
        deeptech: "#0A84FF",
        void: "#000000",
        abyss: "#050B1F",
      },
      fontFamily: {
        hud: ["'Share Tech Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(0,229,255,0.35), inset 0 0 12px rgba(0,229,255,0.08)",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.7" },
          "50%": { opacity: "1" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
        scanline: "scanline 9s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
