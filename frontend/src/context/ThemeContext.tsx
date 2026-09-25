import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEMES = ["light", "dark", "ohngea", "ohngea-dark"] as const;
export type ThemeName = (typeof THEMES)[number];
export type Density = "comfortable" | "compact";

const STORAGE_KEY = "cypherglass_theme";
const DENSITY_KEY = "cypherglass_density";
const CLASS_BY_THEME: Record<ThemeName, string> = {
  light: "",
  dark: "dark",
  ohngea: "theme-ohngea",
  "ohngea-dark": "theme-ohngea-dark",
};

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  density: Density;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved as ThemeName) ? (saved as ThemeName) : "dark";
  });

  const [density, setDensity] = useState<Density>(() => {
    const saved = localStorage.getItem(DENSITY_KEY);
    return saved === "compact" ? "compact" : "comfortable";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "theme-ohngea", "theme-ohngea-dark");
    const cls = CLASS_BY_THEME[theme];
    if (cls) root.classList.add(cls);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (density === "compact") root.setAttribute("data-density", "compact");
    else root.removeAttribute("data-density");
    localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  return <ThemeContext.Provider value={{ theme, setTheme, density, setDensity }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
