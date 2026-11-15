"use client";

import { useRef, useState } from "react";
import { Copy, KeyRound, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function CampaignReportKey({ client, organizationId }: {
  client: SupabaseClient; organizationId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function generate() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setStatus("");
    try {
      const { data, error } = await client.rpc("marketing_rotate_campaign_report_key", { p_organization_id: organizationId });
      if (error || typeof data !== "string") throw error;
      setToken(data);
      dialog.current?.close();
    } catch {
      setStatus("Não foi possível confirmar a emissão da chave.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setStatus("Chave copiada.");
    } catch {
      setStatus("Selecione a chave acima para copiar.");
    }
  }

  return (
    <section className="panel report-key-settings">
      <h2>Integração de relatórios diários</h2>
      <p>Use a chave como credencial Bearer do workflow que envia as métricas das campanhas.</p>
      <button type="button" className="button button-secondary" onClick={() => dialog.current?.showModal()}><KeyRound size={16} /> Gerar chave de integração</button>
      {token && <div className="report-key-result">
        <label>Chave de integração<input readOnly value={token} onFocus={(event) => event.target.select()} /></label>
        <button type="button" className="button button-secondary" onClick={() => void copy()}><Copy size={16} /> Copiar chave</button>
        <p>Guarde a chave no gerenciador de credenciais do workflow. Ela só aparece após a emissão.</p>
      </div>}
      {status && <p role="status">{status}</p>}
      <dialog ref={dialog} className="modal-card payment-dialog" aria-labelledby="key-title"
        onCancel={(event) => { if (saving.current) event.preventDefault(); }}>
        <div className="modal-header">
          <h2 id="key-title">Gerar chave de integração</h2>
          <button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={() => dialog.current?.close()}><X size={19} /></button>
        </div>
        <div className="payment-content">
          <p>Se já houver uma chave, ela será invalidada. Atualize a credencial de qualquer workflow que use a chave anterior.</p>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void generate()}>{busy ? "Gerando…" : "Gerar chave"}</button>
          {status && <p role="status">{status}</p>}
        </div>
      </dialog>
    </section>
  );
}
