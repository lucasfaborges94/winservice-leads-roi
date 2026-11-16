"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, X } from "lucide-react";
import { fullDate, type Campaign } from "@/lib/domain";

type Report = { report_date: string; impressions: number; clicks: number; conversions: number; spend: number; entry_method: "manual" | "automatic" };
const pageSize = 20;
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

export default function CampaignReports({ campaign, client, editable, onSaved, onClose }: {
  campaign: Campaign; client: SupabaseClient; editable: boolean; onSaved: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; rows: Report[]; failed: boolean }>();
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const key = `${page}:${attempt}`;
  const current = state?.key === key ? state : undefined;

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const start = page * pageSize;
    async function load() {
      const { data, error } = await client.from("marketing_campaign_daily_reports")
        .select("report_date, impressions, clicks, conversions, spend, entry_method")
        .eq("campaign_id", campaign.id).eq("organization_id", campaign.organization_id)
        .order("report_date", { ascending: false }).range(start, start + pageSize)
        .abortSignal(controller.signal);
      if (!controller.signal.aborted) setState({ key, rows: data ?? [], failed: Boolean(error) });
    }
    void load();
    return () => controller.abort();
  }, [campaign.id, campaign.organization_id, client, key, page]);

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setSaveStatus("");
    const { error } = await client.from("marketing_campaign_daily_reports").upsert({
      campaign_id: campaign.id,
      organization_id: campaign.organization_id,
      report_date: String(form.get("date")),
      spend: Number(form.get("spend")),
      impressions: Number(form.get("impressions")),
      clicks: Number(form.get("clicks")),
      conversions: Number(form.get("conversions")),
      entry_method: "manual",
    }, { onConflict: "campaign_id,report_date" });
    setSaving(false);
    if (error) {
      setSaveStatus(error.code === "42501" ? "O relatório automático desta data não pode ser substituído manualmente." : error.message);
      return;
    }
    setPage(0);
    setAttempt(value => value + 1);
    setSaveStatus("Relatório manual salvo.");
    onSaved();
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(campaign.id);
      setCopyStatus("ID copiado.");
    } catch {
      setCopyStatus("Selecione o ID acima para copiar.");
    }
  }

  return (
    <dialog ref={dialog} className="modal-card payment-dialog report-dialog" aria-labelledby="report-title" onClose={onClose}>
      <div className="modal-header">
        <div><h2 id="report-title">Relatórios diários</h2><p>{campaign.name} · {campaign.platform}</p></div>
        <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="payment-content">
        <div className="report-campaign-id">
          <span>ID da campanha para integração</span>
          <code>{campaign.id}</code>
          <button type="button" className="button button-secondary" onClick={() => void copyId()}><Copy size={15} /> Copiar ID</button>
          {copyStatus && <span role="status">{copyStatus}</span>}
        </div>
        {editable && <form className="crm-filters" onSubmit={saveReport}>
          <label>Data<input type="date" name="date" required /></label>
          <label>Investimento (R$)<input name="spend" type="number" min="0" step="0.01" required /></label>
          <label>Impressões<input name="impressions" type="number" min="0" step="1" required /></label>
          <label>Cliques<input name="clicks" type="number" min="0" step="1" required /></label>
          <label>Conversões<input name="conversions" type="number" min="0" step="0.000001" required /></label>
          <button className="button button-primary" disabled={saving}>Salvar relatório manual</button>
        </form>}
        {saveStatus && <p role="status">{saveStatus}</p>}
        <section aria-label="Histórico por data" aria-busy={!current}>
          {!current && <p role="status">Carregando relatórios…</p>}
          {current?.failed && <div className="payment-pagination">
            <p role="alert">Não foi possível carregar os relatórios.</p>
            <button className="button button-secondary" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>
          </div>}
          {current && !current.failed && !current.rows.length && <p>Nenhum relatório recebido para esta campanha.</p>}
          {!!current?.rows.length && <ul className="daily-report-list">
            {current.rows.slice(0, pageSize).map((report) => (
              <li key={report.report_date}>
                <time dateTime={report.report_date}>{fullDate(`${report.report_date}T12:00:00`)}</time>
                <dl>
                  <div><dt>Entrada</dt><dd>{report.entry_method === "manual" ? "Manual" : "Automática"}</dd></div>
                  <div><dt>Investimento</dt><dd>{report.spend.toLocaleString("pt-BR", {style:"currency",currency:"BRL"})}</dd></div>
                  <div><dt>Impressões</dt><dd>{number.format(report.impressions)}</dd></div>
                  <div><dt>Cliques</dt><dd>{number.format(report.clicks)}</dd></div>
                  <div><dt>Conversões</dt><dd>{number.format(report.conversions)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>}
          {current && !current.failed && (page > 0 || current.rows.length > pageSize) && <div className="payment-pagination">
            <button className="button button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page + 1}</span>
            <button className="button button-secondary" disabled={current.rows.length <= pageSize} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>}
        </section>
      </div>
    </dialog>
  );
}
