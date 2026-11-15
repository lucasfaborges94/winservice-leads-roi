"use client";

import { useSyncExternalStore } from "react";

const storageKey = "winservice-theme";
const eventName = "winservice-theme-change";
type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" ? current : "system";
}

function subscribe(update: () => void) {
  function sync(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) {
      document.documentElement.dataset.theme = event.newValue === "dark" || event.newValue === "light" ? event.newValue : "system";
      update();
    }
  }
  window.addEventListener("storage", sync);
  window.addEventListener(eventName, update);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener(eventName, update);
  };
}

export default function ThemeSelector() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  return (
    <label>Tema
      <select aria-label="Tema" value={theme} onChange={(event) => {
        const value = event.currentTarget.value;
        document.documentElement.dataset.theme = value;
        try { localStorage.setItem(storageKey, value); } catch { /* The selection still applies to this page. */ }
        window.dispatchEvent(new Event(eventName));
      }}>
        <option value="system">Sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
      </select>
    </label>
  );
}
