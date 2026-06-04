import { useState, useEffect } from "react";

const KEY = "grow-theme";

function applyTheme(t) {
  if (t === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = t;
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => localStorage.getItem(KEY) ?? "auto");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
