"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { BRL, fullDate, localInputDate, type Campaign } from "@/lib/domain";

type Payment = { id: string; paid_on: string; amount: number; method: string | null; reference: string | null; notes: string | null };
const pageSize = 20;

export default function CampaignPayments({ campaign, client, editable, onClose }: {
  campaign: Campaign; client: SupabaseClient; editable: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [paymentId, setPaymentId] = useState<string>();
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: Payment[]; error: string }>();
  const key = `${page}:${revision}`;
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const start = page * pageSize;
      const { data, error } = await client.from("marketing_campaign_payments")
        .select("id, paid_on, amount, method, reference, notes")
        .eq("organization_id", campaign.organization_id).eq("campaign_id", campaign.id)
        .order("paid_on", { ascending: false }).order("created_at", { ascending: false })
        .order("id", { ascending: false }).range(start, start + pageSize);
      if (active) setResult({
        key, rows: data ?? [], error: error ? "Não foi possível carregar os pagamentos da campanha." : "",
      });
    }
    void load();
    return () => { active = false; };
  }, [campaign.id, campaign.organization_id, client, key, page]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || saving.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const amount = Number(fields.get("amount"));
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 9999999999.99) {
      setFormError("Informe um valor válido em reais.");
      return;
    }

    saving.current = true;
    setBusy(true);
    setNotice("");
    setFormError("");
    try {
      const id = paymentId ?? crypto.randomUUID();
      setPaymentId(id);
      const { error } = await client.from("marketing_campaign_payments").upsert({
        id, campaign_id: campaign.id, organization_id: campaign.organization_id,
        paid_on: String(fields.get("paid_on")), amount,
        method: String(fields.get("method") || "").trim() || null,
        reference: String(fields.get("reference") || "").trim() || null,
        notes: String(fields.get("notes") || "").trim() || null,
      }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
      form.reset();
      setPaymentId(undefined);
      setPage(0);
      setRevision((value) => value + 1);
      setNotice("Pagamento registrado.");
    } catch {
      setFormError("Não foi possível confirmar o registro. Tente novamente.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="modal-card payment-dialog" aria-labelledby="payment-title"
      onClose={onClose} onCancel={(event) => { if (saving.current) event.preventDefault(); }}>
      <div className="modal-header">
        <div><h2 id="payment-title">Histórico de pagamentos</h2><p>{campaign.name} · {campaign.platform}</p></div>
        <button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={19} /></button>
      </div>
      <div className="payment-content">
        <p className="payment-context">Pagamentos à plataforma são registrados separadamente do investimento usado no ROI.</p>
        {editable && (
          <form className="payment-form" onSubmit={save}>
            <fieldset className="form-grid" disabled={busy}>
              <legend>Registrar pagamento</legend>
              <label>Data do pagamento<input name="paid_on" type="date" defaultValue={localInputDate().slice(0, 10)} required /></label>
              <label>Valor (R$)<input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max="9999999999.99" required /></label>
              <label>Forma de pagamento<input name="method" maxLength={80} placeholder="Ex.: Pix" /></label>
              <label>Referência<input name="reference" maxLength={120} placeholder="Ex.: número da fatura" /></label>
              <label className="payment-notes">Observações<textarea name="notes" maxLength={500} rows={2} /></label>
              <button className="button button-primary" type="submit">{busy ? "Registrando…" : "Registrar pagamento"}</button>
            </fieldset>
            {formError && <p className="inline-error" role="alert">{formError}</p>}
            {notice && <p className="inline-success" role="status">{notice}</p>}
          </form>
        )}
        <section aria-label="Pagamentos registrados" aria-busy={!current}>
          {!current && <p role="status">Carregando pagamentos…</p>}
          {current?.error && <div className="payment-pagination"><p role="alert">{current.error}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></div>}
          {current && !current.error && !current.rows.length && <p>Nenhum pagamento encontrado.</p>}
          {!!current?.rows.length && <ul className="payment-list">
            {current.rows.slice(0, pageSize).map((payment) => (
              <li key={payment.id}>
                <div>
                  <time dateTime={payment.paid_on}>{fullDate(`${payment.paid_on}T12:00:00`)}</time>
                  {(payment.method || payment.reference) && <p>{[payment.method, payment.reference].filter(Boolean).join(" · ")}</p>}
                  {payment.notes && <p>{payment.notes}</p>}
                </div>
                <strong>{BRL(payment.amount)}</strong>
              </li>
            ))}
          </ul>}
          {current && !current.error && (page > 0 || current.rows.length > pageSize) && (
            <div className="payment-pagination">
              <button className="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
              <span>Página {page + 1}</span>
              <button className="button" disabled={current.rows.length <= pageSize} onClick={() => setPage(page + 1)}>Próxima</button>
            </div>
          )}
        </section>
      </div>
    </dialog>
  );
}
