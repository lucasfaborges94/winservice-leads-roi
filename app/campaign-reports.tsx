"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, X } from "lucide-react";
import { fullDate, type Campaign } from "@/lib/domain";

type Report = { report_date: string; impressions: number; clicks: number; conversions: number };
const pageSize = 20;
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

export default function CampaignReports({ campaign, client, onClose }: {
  campaign: Campaign; client: SupabaseClient; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; rows: Report[]; failed: boolean }>();
  const [copyStatus, setCopyStatus] = useState("");
  const key = `${page}:${attempt}`;
  const current = state?.key === key ? state : undefined;

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const start = page * pageSize;
    async function load() {
      const { data, error } = await client.from("marketing_campaign_daily_reports")
        .select("report_date, impressions, clicks, conversions")
        .eq("campaign_id", campaign.id).eq("organization_id", campaign.organization_id)
        .order("report_date", { ascending: false }).range(start, start + pageSize)
        .abortSignal(controller.signal);
      if (!controller.signal.aborted) setState({ key, rows: data ?? [], failed: Boolean(error) });
    }
    void load();
    return () => controller.abort();
  }, [campaign.id, campaign.organization_id, client, key, page]);

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
