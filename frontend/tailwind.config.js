/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#0F172A",
        mute: "#64748B",
        brand: {
          DEFAULT: "#2563EB",
          dark: "#1D4ED8",
          deep: "#1E40AF",
          tint: "#EFF4FF",
        },
        canvas: "#E9ECF1",
      },
      borderRadius: { card: "24px", chip: "14px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 12px 32px -12px rgba(15,23,42,.10)",
        chip: "0 1px 2px rgba(15,23,42,.05)",
        lift: "0 2px 4px rgba(15,23,42,.04), 0 24px 48px -20px rgba(15,23,42,.18)",
      },
      keyframes: {
        spinslow: { to: { transform: "rotate(360deg)" } },
      },
      animation: { spinslow: "spinslow 24s linear infinite" },
    },
  },
  plugins: [],
};
