import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        totals: {
          DEFAULT: "hsl(var(--totals-row))",
          foreground: "hsl(var(--totals-text))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        "on-error": "#690005",
        "primary-fixed": "#7df4ff",
        "on-tertiary-fixed": "#2d004f",
        "on-secondary-container": "#520049",
        "inverse-surface": "#e2e2eb",
        "surface-container": "#1e1f26",
        "secondary": "#fface8",
        "surface": "#111319",
        "on-tertiary-container": "#8d00e5",
        "on-primary-container": "#006970",
        "surface-container-highest": "#33343b",
        "primary-fixed-dim": "#00dbe9",
        "on-tertiary": "#4b007e",
        "surface-bright": "#373940",
        "on-secondary-fixed": "#3a0033",
        "on-secondary-fixed-variant": "#840076",
        "inverse-on-surface": "#2e3037",
        "secondary-container": "#ff24e4",
        "tertiary-fixed-dim": "#dfb7ff",
        "on-primary-fixed": "#002022",
        "surface-tint": "#00dbe9",
        "surface-container-high": "#282a30",
        "secondary-fixed-dim": "#fface8",
        "on-surface-variant": "#b9cacb",
        "tertiary": "#fdf2ff",
        "on-error-container": "#ffdad6",
        "on-secondary": "#5e0053",
        "surface-variant": "#33343b",
        "secondary-fixed": "#ffd7f0",
        "tertiary-container": "#ebcfff",
        "on-tertiary-fixed-variant": "#6b00b0",
        "surface-dim": "#111319",
        "outline-variant": "#3b494b",
        "primary-container": "#00f0ff",
        "on-primary": "#00363a",
        "surface-container-lowest": "#0c0e14",
        "outline": "#849495",
        "tertiary-fixed": "#f1daff",
        "on-primary-fixed-variant": "#004f54",
        "surface-container-low": "#191b22",
      },
      fontFamily: {
        "display-lg": ["Space Grotesk"],
        "headline-lg": ["Space Grotesk"],
        "label-sm": ["Hanken Grotesk"],
        "body-md": ["Hanken Grotesk"]
      },
      spacing: {
        "container-padding-mobile": "20px",
        "container-padding-desktop": "40px",
        "gutter": "24px",
        "unit": "8px",
        "section-gap": "64px"
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
