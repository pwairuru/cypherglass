import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEMES = ["light", "dark", "ohngea", "ohngea-dark"] as const;
export type ThemeName = (typeof THEMES)[number];

const STORAGE_KEY = "cypherglass_theme";
const CLASS_BY_THEME: Record<ThemeName, string> = {
  light: "",
  dark: "dark",
  ohngea: "theme-ohngea",
  "ohngea-dark": "theme-ohngea-dark",
};

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved as ThemeName) ? (saved as ThemeName) : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "theme-ohngea", "theme-ohngea-dark");
    const cls = CLASS_BY_THEME[theme];
    if (cls) root.classList.add(cls);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
