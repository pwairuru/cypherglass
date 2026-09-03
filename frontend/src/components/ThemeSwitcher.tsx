import { THEMES, useTheme, type ThemeName } from "../context/ThemeContext";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <label>
      Theme{" "}
      <select
        className="input"
        style={{ width: "auto", display: "inline-block", marginTop: 0 }}
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeName)}
      >
        {THEMES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
