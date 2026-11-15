"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => { setPrompt(undefined); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", complete);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  async function install() {
    if (prompt) {
      setPrompt(undefined);
      try {
        if ((await prompt.prompt()).outcome === "accepted") setInstalled(true);
        return;
      } catch {
        // The browser can revoke the prompt if its install state changes.
      }
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setInstructions(ios
      ? "Abra esta página no Safari. Toque em Compartilhar → Adicionar à Tela de Início → Adicionar. Se aparecer a opção Abrir como App da Web, ative-a."
      : "No Chrome, abra o menu ⋮ e escolha Instalar app ou Adicionar à tela inicial. Confirme a instalação.");
    dialog.current?.showModal();
  }

  if (installed) return null;
  return <>
    <button className={`button install-button ${prompt ? "install-ready" : ""}`} aria-label="Instalar app" onClick={() => void install()}>
      <Download size={16} /><span>Instalar app</span>
    </button>
    <dialog ref={dialog} className="modal-card install-dialog" aria-labelledby="install-title">
      <div className="modal-header">
        <h2 id="install-title">Instalar Winservice Leads & ROI</h2>
        <button className="icon-button" aria-label="Fechar" onClick={() => dialog.current?.close()}><X size={17} /></button>
      </div>
      <p>{instructions}</p>
    </dialog>
  </>;
}
