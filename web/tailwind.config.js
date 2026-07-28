/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17191d",
        muted: "#6c727f",
        line: "#e5e7ec",
        violet: {
          50: "#f6f4ff",
          100: "#efebff",
          500: "#6d5ce7",
          600: "#5d4bd6",
          700: "#4c3db5",
        },
      },
      boxShadow: {
        shell:
          "0 35px 90px rgba(24, 35, 54, 0.20), 0 8px 24px rgba(24, 35, 54, 0.10)",
        card: "0 1px 2px rgba(16, 24, 40, 0.035)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.7)", opacity: "0" },
        },
        blinkSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "pulse-soft": "pulseSoft 2.4s ease-out infinite",
        "blink-soft": "blinkSoft 1.7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
