"use client";

import { useEffect, useState } from "react";

export function ThemeControl() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [accentHue, setAccentHue] = useState(36); // Gold hue by default
  const [showMenu, setShowMenu] = useState(false);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("zao-theme") as "light" | "dark" | null;
    const savedHue = localStorage.getItem("zao-accent-hue");

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const newTheme = savedTheme || (prefersDark ? "dark" : "light");
    const newHue = savedHue ? parseInt(savedHue, 10) : 36;

    setTheme(newTheme);
    setAccentHue(newHue);
    applyTheme(newTheme, newHue);
    setMounted(true);
  }, []);

  function applyTheme(t: "light" | "dark", h: number) {
    const root = document.documentElement;
    root.setAttribute("data-theme", t);

    // Generate accent colors from hue using HSL
    const accentHsl = `hsl(${h}, 95%, 48%)`;
    const accentLight = `hsl(${h}, 95%, 58%)`;
    const accentDark = `hsl(${h}, 95%, 38%)`;

    root.style.setProperty("--accent", accentHsl);
    root.style.setProperty("--accent-light", accentLight);
    root.style.setProperty("--accent-dark", accentDark);

    // Store preferences
    localStorage.setItem("zao-theme", t);
    localStorage.setItem("zao-accent-hue", h.toString());
  }

  function toggleTheme() {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    applyTheme(newTheme, accentHue);
  }

  function handleHueChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newHue = parseInt(e.target.value, 10);
    setAccentHue(newHue);
    applyTheme(theme, newHue);
  }

  if (!mounted) return null;

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        aria-label="Theme control"
        aria-expanded={showMenu}
        title="Theme & colors"
        className="px-2.5 py-1.5 rounded-lg text-xs border border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition"
      >
        <span className="text-sm leading-none">🎨</span>
      </button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] rounded-xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-3 space-y-3">
          {/* Dark/Light Toggle */}
          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              Theme
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTheme("dark");
                  applyTheme("dark", accentHue);
                }}
                aria-pressed={theme === "dark"}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                  theme === "dark"
                    ? "bg-white/10 text-white border-white/20"
                    : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
                }`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => {
                  setTheme("light");
                  applyTheme("light", accentHue);
                }}
                aria-pressed={theme === "light"}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                  theme === "light"
                    ? "bg-white/10 text-white border-white/20"
                    : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
                }`}
              >
                Light
              </button>
            </div>
          </div>

          {/* Accent Hue Slider */}
          <div className="space-y-2">
            <label htmlFor="accent-hue" className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              Accent Color
            </label>
            <input
              id="accent-hue"
              type="range"
              min="0"
              max="360"
              value={accentHue}
              onChange={handleHueChange}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right,
                  hsl(0, 95%, 48%),
                  hsl(45, 95%, 48%),
                  hsl(90, 95%, 48%),
                  hsl(135, 95%, 48%),
                  hsl(180, 95%, 48%),
                  hsl(225, 95%, 48%),
                  hsl(270, 95%, 48%),
                  hsl(315, 95%, 48%),
                  hsl(360, 95%, 48%))`,
              }}
            />
            <div className="text-xs text-white/50 text-center">
              Hue: {accentHue}°
            </div>
          </div>

          {/* Preset Accent Colors */}
          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              Presets
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "Gold", hue: 36 },
                { label: "Blue", hue: 220 },
                { label: "Purple", hue: 280 },
                { label: "Pink", hue: 320 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setAccentHue(preset.hue);
                    applyTheme(theme, preset.hue);
                  }}
                  title={preset.label}
                  className={`h-8 rounded-lg border-2 transition ${
                    accentHue === preset.hue
                      ? "border-white/40"
                      : "border-transparent hover:border-white/20"
                  }`}
                  style={{
                    backgroundColor: `hsl(${preset.hue}, 95%, 48%)`,
                  }}
                  aria-label={`Select ${preset.label} accent`}
                />
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="text-[10px] text-white/40 px-2 py-1 rounded-lg bg-white/5">
            Your theme preference is saved locally.
          </div>
        </div>
      )}
    </div>
  );
}
