import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("certuary-theme") ?? "dark",
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("certuary-theme", theme);
  }, [theme]);
  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
