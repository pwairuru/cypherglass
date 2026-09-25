import { Moon, Leaf, MoonStar, type LucideIcon } from "lucide-react";
import { THEMES, useTheme, type ThemeName } from "../context/ThemeContext";

const ICON_BY_THEME: Record<ThemeName, LucideIcon> = {
  dark: Moon,
  ohngea: Leaf,
  "ohngea-dark": MoonStar,
};

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const Icon = ICON_BY_THEME[theme];
  return (
    <button
      className="btn btn-icon"
      type="button"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme} (click for ${next})`}
      onClick={() => setTheme(next)}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
