"use client";

import {
  Activity as ActivityIcon, ArrowUpRight, Bell, Check, ChevronDown,
  CircleDollarSign, ClipboardList, Clock3, FileCheck2, FilePlus2, Filter, Gauge,
  HandCoins, LayoutDashboard, LogOut, Mail, Megaphone, MessageCircle, MoreHorizontal,
  Phone, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Target, UserRound,
  Users, X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  BRL, canManageCampaigns, canManageCrm, canManageTeam, canSeeAnalytics, fullDate,
  initials, LEAD_STAGES, localInputDate, QUOTE_STATUSES, ROLE_DESCRIPTIONS,
  ROLE_LABELS, roiPercent, shortDate,
  type Activity, type Campaign, type CampaignOption, type CampaignSummary, type DashboardData,
  type Lead, type LeadStage, type Quote, type QuoteStatus, type Role,
} from "@/lib/domain";

type Tab = "overview" | "leads" | "quotes" | "campaigns" | "analytics" | "team";
type ContactDraft = { channel: string; value: string; label: string; is_primary: boolean };
type Membership = { id: string; user_id: string; email: string | null; role: Role; created_at: string };

const CONTACT_CHANNELS = ["WhatsApp", "Telegram", "E-mail", "Ligação telefônica", "Instagram", "Site", "Outro"];
const ACQUISITION_SOURCES = ["Google Ads", "Meta Ads", "Busca orgânica", "Indicação", "Direto", "Outro"];
const APPLIANCES = ["Geladeira", "Freezer", "Cervejeira", "Lava e seca", "Máquina de lavar", "Outro"];
const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; access: "all" | "crm" | "campaigns" | "analytics" | "team" }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard, access: "all" },
  { id: "leads", label: "Leads", icon: Users, access: "crm" },
  { id: "quotes", label: "Orçamentos", icon: FileCheck2, access: "crm" },
  { id: "campaigns", label: "Campanhas", icon: Megaphone, access: "campaigns" },
  { id: "analytics", label: "Análises e ROI", icon: Gauge, access: "analytics" },
  { id: "team", label: "Equipe e acessos", icon: ShieldCheck, access: "team" },
];

function statusLabel(stage: LeadStage) { return LEAD_STAGES.find((item) => item.id === stage)?.label || stage; }
function statusTone(stage: LeadStage) { return `status-${stage}`; }
function contactIcon(channel: string) {
  if (channel === "WhatsApp" || channel === "Telegram") return MessageCircle;
  if (channel === "E-mail") return Mail;
  if (channel === "Ligação telefônica") return Phone;
  return UserRound;
}
function getAccess(tab: typeof TABS[number], role: Role) {
  if (tab.access === "all") return true;
  if (tab.access === "crm") return canManageCrm(role);
  if (tab.access === "campaigns") return canSeeAnalytics(role);
  if (tab.access === "analytics") return canSeeAnalytics(role);
  return canManageTeam(role);
}

export default function Home() {
  const [supabase] = useState<SupabaseClient | null>(() => getSupabaseBrowser());
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("Winservice");
  const [role, setRole] = useState<Role>("sales");
  const [tab, setTab] = useState<Tab>("overview");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Record<string, ContactDraft[]>>({});
  const [members, setMembers] = useState<Membership[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [modal, setModal] = useState<"lead" | "campaign" | "quote" | "invite" | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (!data.session) setBooting(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) {
        setSession(nextSession); setAuthMessage(""); setAuthError("");
        if (!nextSession) {
          setBooting(false); setOrganizationId(""); setLeads([]); setQuotes([]);
        }
      }
    });
    return () => { alive = false; authListener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    if (!session?.user) return;
    let alive = true;
    const start = async () => {
      setBooting(true); setError("");
      const { data: orgId, error: workspaceError } = await supabase.rpc("ensure_marketing_workspace");
      if (!alive) return;
      if (workspaceError || !orgId) { setError(workspaceError?.message || "Não foi possível abrir sua equipe."); setBooting(false); return; }
      const { data: member, error: memberError } = await supabase.from("marketing_memberships")
        .select("role, organization_id").eq("organization_id", orgId).eq("user_id", session.user.id).maybeSingle();
      if (!alive) return;
      if (memberError || !member) { setError("Seu usuário ainda não está vinculado a uma equipe."); setBooting(false); return; }
      const userRole = member.role as Role;
      setOrganizationId(orgId); setRole(userRole);
      const { data: org } = await supabase.from("marketing_organizations").select("name").eq("id", orgId).maybeSingle();
      if (alive && org?.name) setOrganizationName(org.name);
      await loadWorkspaceData(orgId, userRole, session);
      if (alive) setBooting(false);
    };
    void start();
    return () => { alive = false; };
  // Workspace loading follows the current signed-in user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session?.user.id]);

  async function loadWorkspaceData(orgId = organizationId, userRole = role, activeSession = session) {
    if (!supabase || !orgId || !activeSession) return;
    setLoadingData(true); setError("");
    const { data: opts, error: optionsError } = await supabase.rpc("marketing_campaign_options", { p_organization_id: orgId });
    if (optionsError) setError(optionsError.message);
    setCampaignOptions((opts || []) as CampaignOption[]);

    if (["owner", "admin", "marketing", "analyst"].includes(userRole)) {
      const { data, error: campaignError } = await supabase.from("marketing_campaigns").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (campaignError) setError(campaignError.message);
      setCampaigns((data || []) as Campaign[]);
    } else setCampaigns([]);

    if (canManageCrm(userRole)) {
      const [leadResult, quoteResult, activityResult, contactResult] = await Promise.all([
        supabase.from("marketing_leads").select("*").eq("organization_id", orgId).order("first_contact_at", { ascending: false }),
        supabase.from("marketing_quotes").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
        supabase.from("marketing_lead_activities").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500),
        supabase.from("marketing_lead_contacts").select("*").eq("organization_id", orgId),
      ]);
      if (leadResult.error) setError(leadResult.error.message);
      setLeads((leadResult.data || []) as Lead[]); setQuotes((quoteResult.data || []) as Quote[]); setActivities((activityResult.data || []) as Activity[]);
      const contactMap: Record<string, ContactDraft[]> = {};
      for (const item of contactResult.data || []) {
        contactMap[item.lead_id] ||= [];
        contactMap[item.lead_id].push({ channel: item.channel, value: item.value, label: item.label || "", is_primary: item.is_primary });
      }
      setContacts(contactMap);
    } else { setLeads([]); setQuotes([]); setActivities([]); setContacts({}); }

    if (canManageTeam(userRole)) {
      const { data, error: memberListError } = await supabase.from("marketing_memberships").select("id,user_id,email,role,created_at").eq("organization_id", orgId).order("created_at");
      if (memberListError) setError(memberListError.message);
      setMembers((data || []) as Membership[]);
    } else setMembers([]);

    if (canSeeAnalytics(userRole)) {
      const { data, error: summaryError } = await supabase.rpc("marketing_dashboard", { p_organization_id: orgId });
      if (summaryError) setError(summaryError.message);
      else setDashboard(data as DashboardData);
    } else setDashboard(null);
    setLoadingData(false);
  }

  const visibleTabs = useMemo(() => TABS.filter((item) => getAccess(item, role)), [role]);
  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const q = search.trim().toLowerCase();
    const contactText = (contacts[lead.id] || []).map((item) => item.value).join(" ");
    const searchMatch = !q || [lead.full_name, lead.phone, lead.email, lead.city, lead.neighborhood, lead.appliance, lead.search_term, contactText]
      .some((value) => (value || "").toLowerCase().includes(q));
    const stageMatch = stageFilter === "all" || lead.stage === stageFilter;
    return searchMatch && stageMatch;
  }), [leads, contacts, search, stageFilter]);

  const followUpsDue = quotes.filter((quote) => quote.next_follow_up_at && new Date(quote.next_follow_up_at) <= new Date() && !["paid", "rejected", "expired"].includes(quote.status));

  function openLead(lead: Lead) { setSelectedLead(lead); }
  function closeModals() { setModal(null); setEditingLead(null); setEditingCampaign(null); }
  async function addActivity(leadId: string, type: string, title: string, details?: string) {
    if (!supabase || !session?.user || !organizationId) return;
    await supabase.from("marketing_lead_activities").insert({ organization_id: organizationId, lead_id: leadId, activity_type: type, title, details: details || null, created_by: session.user.id });
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user || !organizationId) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("full_name") || "").trim();
    const draftContacts = JSON.parse(String(form.get("contacts") || "[]")) as ContactDraft[];
    const phone = String(form.get("phone") || draftContacts.find((item) => ["WhatsApp", "Ligação telefônica"].includes(item.channel))?.value || "").trim();
    const email = String(form.get("email") || draftContacts.find((item) => item.channel === "E-mail")?.value || "").trim();
    const preferred = String(form.get("preferred_contact_channel") || "WhatsApp");
    const contactRows = draftContacts.filter((item) => item.value.trim());
    if (!contactRows.length && !phone && !email) { setError("Cadastre ao menos um telefone, e-mail ou identificador de contato."); return; }
    const selectedCampaign = String(form.get("campaign_id") || "") || null;
    const payload = {
      organization_id: organizationId, campaign_id: selectedCampaign, full_name: name,
      phone, email: email || null, appliance: String(form.get("appliance") || "Geladeira"),
      service_description: String(form.get("service_description") || "") || null,
      city: String(form.get("city") || "Porto Alegre"), neighborhood: String(form.get("neighborhood") || "") || null,
      acquisition_source: String(form.get("acquisition_source") || "Google Ads"), preferred_contact_channel: preferred,
      medium: String(form.get("utm_medium") || "") || null, utm_source: String(form.get("utm_source") || "") || null,
      utm_medium: String(form.get("utm_medium") || "") || null, utm_campaign: String(form.get("utm_campaign") || "") || null,
      landing_page: String(form.get("landing_page") || "") || null,
      search_term: String(form.get("search_term") || "") || null,
      gclid: String(form.get("gclid") || "") || null, wbraid: String(form.get("wbraid") || "") || null, gbraid: String(form.get("gbraid") || "") || null,
      is_qualified: form.get("is_qualified") === "on", qualification_notes: String(form.get("qualification_notes") || "") || null,
      stage: String(form.get("stage") || "new"),
      first_contact_at: String(form.get("first_contact_at") || new Date().toISOString()),
      next_follow_up_at: String(form.get("next_follow_up_at") || "") || null,
      notes: String(form.get("notes") || "") || null,
    };
    setLoadingData(true); setError("");
    const result = editingLead
      ? await supabase.from("marketing_leads").update(payload).eq("id", editingLead.id).select("id").single()
      : await supabase.from("marketing_leads").insert({ ...payload, created_by: session.user.id }).select("id").single();
    if (result.error || !result.data) { setError(result.error?.message || "Não foi possível salvar o lead."); setLoadingData(false); return; }
    const leadId = result.data.id as string;
    if (editingLead) {
      await supabase.from("marketing_lead_contacts").delete().eq("lead_id", leadId).eq("organization_id", organizationId);
    } else {
      await addActivity(leadId, "created", "Lead cadastrado", `${name} entrou pelo canal ${preferred}.`);
    }
    const contactsToSave = [...contactRows];
    if (phone && !contactsToSave.some((item) => item.value === phone)) contactsToSave.push({ channel: preferred === "E-mail" ? "Ligação telefônica" : preferred, value: phone, label: "Principal", is_primary: !contactsToSave.length });
    if (email && !contactsToSave.some((item) => item.value === email)) contactsToSave.push({ channel: "E-mail", value: email, label: "", is_primary: false });
    if (contactsToSave.length) {
      const { error: contactError } = await supabase.from("marketing_lead_contacts").insert(contactsToSave.map((item, index) => ({
        organization_id: organizationId, lead_id: leadId, channel: item.channel, value: item.value.trim(), label: item.label || null, is_primary: item.is_primary || index === 0,
      })));
      if (contactError) setError(contactError.message);
    }
    setNotice(editingLead ? "Lead atualizado." : "Lead cadastrado."); closeModals(); await loadWorkspaceData();
  }

  async function updateLeadStage(lead: Lead, nextStage: LeadStage) {
    if (!supabase) return;
    const wasQualified = lead.is_qualified;
    const isQualified = lead.is_qualified || nextStage === "qualified" || nextStage === "quote_sent" || nextStage === "negotiation" || nextStage === "won";
    const { error: updateError } = await supabase.from("marketing_leads").update({
      stage: nextStage, is_qualified: isQualified,
      closed_at: ["won", "lost"].includes(nextStage) ? new Date().toISOString() : lead.closed_at,
    }).eq("id", lead.id);
    if (updateError) { setError(updateError.message); return; }
    await addActivity(lead.id, "stage_change", `Etapa alterada para ${statusLabel(nextStage)}`);
    if (!wasQualified && isQualified) await addActivity(lead.id, "qualification", "Lead qualificado");
    await loadWorkspaceData();
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user || !organizationId) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      organization_id: organizationId, name: String(form.get("name") || "").trim(),
      platform: String(form.get("platform") || "Google Ads"), external_campaign_id: String(form.get("external_campaign_id") || "") || null,
      objective: String(form.get("objective") || "") || null, landing_page: String(form.get("landing_page") || "") || null,
      target_location: String(form.get("target_location") || "Porto Alegre"), status: String(form.get("status") || "active"),
      period_start: String(form.get("period_start") || "") || null, period_end: String(form.get("period_end") || "") || null,
      daily_budget: Number(form.get("daily_budget") || 0), spend_total: Number(form.get("spend_total") || 0),
      impressions: Number(form.get("impressions") || 0), clicks: Number(form.get("clicks") || 0), ads_conversions: Number(form.get("ads_conversions") || 0),
      notes: String(form.get("notes") || "") || null, created_by: session.user.id,
    };
    const result = editingCampaign
      ? await supabase.from("marketing_campaigns").update(payload).eq("id", editingCampaign.id)
      : await supabase.from("marketing_campaigns").insert(payload);
    if (result.error) { setError(result.error.message); return; }
    setNotice(editingCampaign ? "Campanha atualizada." : "Campanha cadastrada."); closeModals(); await loadWorkspaceData();
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user || !organizationId || !selectedLead) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "Orçamento de serviço").trim();
    const amount = Number(form.get("amount") || 0);
    const { data: quote, error: quoteError } = await supabase.from("marketing_quotes").insert({
      organization_id: organizationId, lead_id: selectedLead.id,
      quote_number: String(form.get("quote_number") || "") || null, title,
      description: String(form.get("description") || "") || null, amount, status: String(form.get("status") || "sent"),
      issued_at: String(form.get("issued_at") || new Date().toISOString()), valid_until: String(form.get("valid_until") || "") || null,
      next_follow_up_at: String(form.get("next_follow_up_at") || "") || null,
      notes: String(form.get("notes") || "") || null, created_by: session.user.id,
    }).select("id").single();
    if (quoteError || !quote) { setError(quoteError?.message || "Não foi possível registrar o orçamento."); return; }
    await addActivity(selectedLead.id, "quote_created", "Orçamento emitido", `${title} — ${BRL(amount)}.`);
    if (String(form.get("status")) === "sent") {
      await supabase.from("marketing_leads").update({ stage: "quote_sent" }).eq("id", selectedLead.id);
      await addActivity(selectedLead.id, "quote_sent", "Orçamento enviado", title);
    }
    setNotice("Orçamento registrado."); setModal(null); await loadWorkspaceData();
  }

  async function updateQuoteStatus(quote: Quote, status: QuoteStatus) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("marketing_quotes").update({
      status, paid_at: status === "paid" ? new Date().toISOString() : quote.paid_at,
      last_follow_up_at: status === "follow_up" ? new Date().toISOString() : quote.last_follow_up_at,
    }).eq("id", quote.id);
    if (updateError) { setError(updateError.message); return; }
    const lead = leads.find((item) => item.id === quote.lead_id);
    if (lead) {
      await addActivity(lead.id, status === "follow_up" ? "quote_follow_up" : "quote_status", `Orçamento ${QUOTE_STATUSES.find((item) => item.id === status)?.label.toLowerCase()}`, `${quote.title} — ${BRL(quote.amount)}.`);
      if (status === "paid") {
        const { data: paidQuotes } = await supabase.from("marketing_quotes").select("amount").eq("lead_id", quote.lead_id).eq("status", "paid");
        const paidTotal = (paidQuotes || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        await supabase.from("marketing_leads").update({ stage: "won", is_qualified: true, won_revenue: paidTotal, closed_at: new Date().toISOString() }).eq("id", quote.lead_id);
        await addActivity(lead.id, "stage_change", "Cliente ganho", `Pagamento registrado: ${BRL(paidTotal)}.`);
      }
    }
    setNotice("Acompanhamento do orçamento atualizado."); await loadWorkspaceData();
  }

  async function runAiAnalysis() {
    if (!session || !organizationId) return;
    setAiBusy(true); setError("");
    try {
      const response = await fetch("/api/ai/insights", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ organizationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível gerar a análise.");
      setAiAnalysis(result.analysis || "Sem recomendações no momento.");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao gerar análise."); }
    finally { setAiBusy(false); }
  }

  async function signOut() { await supabase?.auth.signOut(); setSession(null); setTab("overview"); }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthError(""); setAuthMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    if (authMode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (signUpError) setAuthError(signUpError.message);
      else if (!data.session) setAuthMessage("Confira seu e-mail para confirmar o cadastro e entrar.");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setAuthError(signInError.message);
    }
    setAuthBusy(false);
  }

  if (!supabase) return <SetupScreen />;
  if (booting) return <div className="startup"><div className="brand-mark">W</div><span>Preparando seu espaço de trabalho…</span></div>;
  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={authenticate} busy={authBusy} message={authMessage} error={authError} />;

  const currentTab = visibleTabs.some((item) => item.id === tab) ? tab : "overview";
  const setTabSafe = (next: Tab) => { if (visibleTabs.some((item) => item.id === next)) setTab(next); };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">W</div><div><strong>winservice</strong><span>LEADS & ROI</span></div></div>
        <div className="workspace-switch"><div className="workspace-avatar">{initials(organizationName)}</div><div className="workspace-name"><strong>{organizationName}</strong><span>Espaço de trabalho</span></div><ChevronDown size={15} /></div>
        <div className="nav-group-label">MENU PRINCIPAL</div>
        <nav className="main-nav">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            return <button className={`nav-item ${currentTab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTabSafe(item.id)}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "quotes" && followUpsDue.length > 0 && <i className="nav-badge">{followUpsDue.length}</i>}</button>;
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help"><div className="help-icon"><Sparkles size={16} /></div><strong>Dados que viram decisões</strong><p>Registre cada etapa para conhecer o retorno real de cada campanha.</p><button onClick={() => setTabSafe(canSeeAnalytics(role) ? "analytics" : "leads")}>Ver como funciona <ArrowUpRight size={13} /></button></div>
        <button className="profile-row" onClick={signOut}><div className="profile-avatar">{initials(session.user.email || "W")}</div><div><strong>{session.user.email}</strong><span>{ROLE_LABELS[role]}</span></div><LogOut size={16} /></button>
      </aside>

      <section className="main-panel">
        <header className="topbar"><div className="breadcrumbs"><span>Winservice</span><span className="crumb-separator">/</span><strong>{visibleTabs.find((item) => item.id === currentTab)?.label}</strong></div><div className="top-actions"><span className="today-chip"><span className="live-dot" /> Acompanhamento ativo</span><button className="icon-button" aria-label="Atualizar" onClick={() => void loadWorkspaceData()}><ActivityIcon size={18} /></button><button className="icon-button notification-button" aria-label="Notificações"><Bell size={18} /><i /></button><button className="avatar-button" title={session.user.email || "Conta"}>{initials(session.user.email || "W")}</button></div></header>
        {(error || notice) && <div className={`toast ${error ? "toast-error" : "toast-success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Fechar"><X size={15} /></button></div>}
        <div className="page-content">
          {currentTab === "overview" && <OverviewPage role={role} leads={leads} quotes={quotes} dashboard={dashboard} campaigns={campaigns} onNewLead={() => { setEditingLead(null); setModal("lead"); }} onOpenLead={openLead} onNavigate={setTabSafe} loading={loadingData} />}
          {currentTab === "leads" && <LeadsPage leads={filteredLeads} allCount={leads.length} search={search} setSearch={setSearch} stageFilter={stageFilter} setStageFilter={setStageFilter} contacts={contacts} campaigns={campaignOptions} onNew={() => { setEditingLead(null); setModal("lead"); }} onOpen={openLead} onStage={updateLeadStage} onEdit={(lead) => { setEditingLead(lead); setModal("lead"); }} />}
          {currentTab === "quotes" && <QuotesPage quotes={quotes} leads={leads} onNew={(lead) => { setSelectedLead(lead); setModal("quote"); }} onStatus={updateQuoteStatus} onOpenLead={(lead) => { setSelectedLead(lead); setTabSafe("leads"); }} />}
          {currentTab === "campaigns" && <CampaignsPage role={role} campaigns={campaigns} dashboard={dashboard} onNew={() => { setEditingCampaign(null); setModal("campaign"); }} onEdit={(campaign) => { setEditingCampaign(campaign); setModal("campaign"); }} />}
          {currentTab === "analytics" && <AnalyticsPage dashboard={dashboard} aiAnalysis={aiAnalysis} aiBusy={aiBusy} onAnalyze={runAiAnalysis} />}
          {currentTab === "team" && <TeamPage members={members} role={role} session={session} organizationId={organizationId} supabase={supabase} onInvite={() => setModal("invite")} onReload={() => loadWorkspaceData()} onNameChange={setOrganizationName} />}
        </div>
      </section>

      {modal === "lead" && <LeadModal lead={editingLead} campaigns={campaignOptions} existingContacts={editingLead ? contacts[editingLead.id] || [] : []} onClose={closeModals} onSubmit={saveLead} />}
      {modal === "campaign" && <CampaignModal campaign={editingCampaign} onClose={closeModals} onSubmit={saveCampaign} />}
      {modal === "quote" && selectedLead && <QuoteModal lead={selectedLead} onClose={() => setModal(null)} onSubmit={saveQuote} />}
      {modal === "invite" && <InviteModal organizationId={organizationId} session={session} onClose={() => setModal(null)} onDone={async (message) => { setNotice(message); setModal(null); await loadWorkspaceData(); }} onError={setError} />}
      {selectedLead && !modal && <LeadDetail lead={leads.find((item) => item.id === selectedLead.id) || selectedLead} quotes={quotes.filter((item) => item.lead_id === selectedLead.id)} activities={activities.filter((item) => item.lead_id === selectedLead.id)} contacts={contacts[selectedLead.id] || []} campaign={campaigns.find((item) => item.id === selectedLead.campaign_id)} role={role} onClose={() => setSelectedLead(null)} onAddQuote={() => setModal("quote")} onEdit={() => { setEditingLead(selectedLead); setModal("lead"); }} onStage={updateLeadStage} />}
      {loadingData && <div className="sync-indicator"><span /> Sincronizando</div>}
    </main>
  );
}

function SetupScreen() {
  return <main className="auth-page"><div className="setup-card"><div className="brand-mark">W</div><h1>Conecte seu workspace</h1><p>Configure as variáveis do Supabase conforme o arquivo <code>.env.example</code> para ativar o login e o banco de dados.</p><div className="setup-steps"><span>1</span><p>Aplique a migração indicada no README ao projeto Supabase.</p><span>2</span><p>Configure URL, chave publicável e segredo do servidor.</p><span>3</span><p>Adicione uma chave do Google AI Studio para análises de campanha.</p></div></div></main>;
}

function AuthScreen({ mode, setMode, onSubmit, busy, message, error }: { mode: "login" | "signup"; setMode: (value: "login" | "signup") => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; message: string; error: string }) {
  return <main className="auth-page"><div className="auth-decoration auth-decoration-one" /><div className="auth-decoration auth-decoration-two" /><div className="auth-layout"><div className="auth-story"><div className="brand-lockup"><div className="brand-mark">W</div><div><strong>winservice</strong><span>LEADS & ROI</span></div></div><div className="story-copy"><p className="eyebrow">RELACIONAMENTO QUE GERA RESULTADO</p><h1>Da primeira conversa ao serviço pago.</h1><p>Registre os contatos, acompanhe cada orçamento e descubra quais campanhas trazem clientes de verdade.</p><div className="story-metric"><span>LEADS</span><div><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><span>RESULTADO</span></div></div><div className="auth-story-footer"><ShieldCheck size={17} /> Dados protegidos por acesso individual e permissões por função</div></div><div className="auth-card"><div className="mobile-brand"><div className="brand-mark">W</div><strong>winservice</strong></div><p className="eyebrow">BEM-VINDO À SUA OPERAÇÃO</p><h2>{mode === "login" ? "Acesse sua conta" : "Crie sua conta"}</h2><p className="auth-subtitle">{mode === "login" ? "Entre para acompanhar sua equipe e seus resultados." : "O primeiro usuário será o proprietário do espaço."}</p><form onSubmit={onSubmit} className="form-stack"><label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label><label>Senha<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres" minLength={8} required /></label>{error && <div className="inline-error">{error}</div>}{message && <div className="inline-success">{message}</div>}<button className="button button-primary button-wide" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar no workspace" : "Criar conta"}</button></form><div className="auth-switch">{mode === "login" ? "Ainda não tem acesso?" : "Já tem uma conta?"}<button onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Criar conta" : "Fazer login"}</button></div><div className="auth-roles"><ShieldCheck size={16} /><span>Autenticação segura pelo Supabase · acesso isolado por equipe</span></div></div></div></main>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}

function OverviewPage({ role, leads, quotes, dashboard, campaigns, onNewLead, onOpenLead, onNavigate, loading }: { role: Role; leads: Lead[]; quotes: Quote[]; dashboard: DashboardData | null; campaigns: Campaign[]; onNewLead: () => void; onOpenLead: (lead: Lead) => void; onNavigate: (tab: Tab) => void; loading: boolean }) {
  const analytics = canSeeAnalytics(role);
  const crm = canManageCrm(role);
  const spend = dashboard?.totals.campaign_spend || 0;
  const revenue = dashboard?.totals.revenue ?? leads.filter((lead) => lead.stage === "won").reduce((sum, lead) => sum + Number(lead.won_revenue), 0);
  const leadCount = dashboard?.totals.leads ?? leads.length;
  const won = dashboard?.totals.won ?? leads.filter((lead) => lead.stage === "won").length;
  const qualified = dashboard?.totals.qualified ?? leads.filter((lead) => lead.is_qualified).length;
  const roi = roiPercent(revenue, spend);
  const recentLeads = leads.slice(0, 5);
  const pipeline = LEAD_STAGES.slice(0, 6).map((stage) => ({ ...stage, count: leads.filter((lead) => lead.stage === stage.id).length }));
  const maxStage = Math.max(1, ...pipeline.map((item) => item.count));
  const convRate = leadCount ? Math.round((won / leadCount) * 100) : 0;
  return <>
    <PageHeading eyebrow="ACOMPANHAMENTO OPERACIONAL" title={`Olá, ${role === "sales" ? "time de vendas" : "Winservice"} 👋`} description="Veja como estão seus contatos, orçamentos e resultados." action={crm ? <button className="button button-primary" onClick={onNewLead}><Plus size={17} /> Novo lead</button> : undefined} />
    <div className="dashboard-grid">
      <StatCard label={analytics ? "Investimento em campanhas" : "Leads cadastrados"} value={analytics ? BRL(spend) : String(leadCount)} note={analytics ? `${campaigns.length} campanhas monitoradas` : "Em todo o período"} icon={analytics ? CircleDollarSign : Users} tone="blue" trend={analytics ? "Marketing" : "CRM"} />
      <StatCard label={analytics ? "Leads qualificados" : "Leads qualificados"} value={String(qualified)} note={leadCount ? `${Math.round((qualified / leadCount) * 100)}% do total de leads` : "Aguardando os primeiros leads"} icon={Target} tone="purple" trend="Qualificação" />
      <StatCard label="Clientes ganhos" value={String(won)} note={leadCount ? `${convRate}% de conversão em clientes` : "Registre o primeiro serviço"} icon={HandCoins} tone="green" trend="Vendas" />
      <StatCard label={analytics ? "Faturamento atribuído" : "Orçamentos em aberto"} value={analytics ? BRL(revenue) : String(quotes.filter((quote) => ["sent", "follow_up", "approved"].includes(quote.status)).length)} note={analytics ? "Somente serviços ganhos e registrados" : "Enviados ou aguardando retorno"} icon={analytics ? CircleDollarSign : ClipboardList} tone="orange" trend={analytics ? (roi === null ? "ROI sem investimento" : `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}% ROI`) : "Acompanhamento"} />
    </div>
    <div className="overview-main-grid">
      <section className="panel funnel-panel"><div className="panel-heading"><div><h2>Funil de atendimento</h2><p>Leads registrados em cada etapa</p></div><button className="text-button" onClick={() => onNavigate(crm ? "leads" : "analytics")}>Ver detalhes <ArrowUpRight size={14} /></button></div>{crm ? <div className="funnel-content">{pipeline.map((stage) => <div className="funnel-row" key={stage.id}><span className="funnel-label">{stage.label}</span><div className="funnel-track"><div className={`funnel-fill ${statusTone(stage.id)}`} style={{ width: `${Math.max(stage.count ? 12 : 0, (stage.count / maxStage) * 100)}%` }} /></div><strong>{stage.count}</strong></div>)}<div className="funnel-footnote"><span><i className="dot-green" /> Clientes ganhos</span><strong>{won} <small>de {leadCount} leads</small></strong></div></div> : <div className="analytics-mini"><div className="donut" style={{ background: `conic-gradient(#6957e8 ${Math.min(100, convRate)}%, #f0eff5 0)` }}><div><strong>{convRate}%</strong><span>clientes</span></div></div><div><strong>{won} clientes ganhos</strong><p>de {leadCount} leads registrados</p><button className="text-button" onClick={() => onNavigate("analytics")}>Ver análise completa <ArrowUpRight size={14} /></button></div></div>}</section>
      <section className="panel attention-panel"><div className="panel-heading"><div><h2>Próximos acompanhamentos</h2><p>Orçamentos que merecem atenção</p></div><div className="attention-icon"><Clock3 size={17} /></div></div>{crm ? quotes.filter((quote) => quote.next_follow_up_at && !["paid", "rejected", "expired"].includes(quote.status)).slice(0, 4).length ? quotes.filter((quote) => quote.next_follow_up_at && !["paid", "rejected", "expired"].includes(quote.status)).slice(0, 4).map((quote) => { const lead = leads.find((item) => item.id === quote.lead_id); return <div className="follow-up-row" key={quote.id}><div className="follow-up-avatar">{initials(lead?.full_name || "L")}</div><div className="follow-up-copy"><strong>{lead?.full_name || "Lead"}</strong><span>{quote.title}</span></div><div className="follow-up-due">{shortDate(quote.next_follow_up_at)}<span>{BRL(quote.amount)}</span></div></div>; }) : <EmptyMini icon={Check} title="Tudo em dia" text="Nenhum orçamento com retorno pendente." /> : <EmptyMini icon={ShieldCheck} title="Acesso de análise" text="A equipe de vendas registra os acompanhamentos aqui." />}{crm && <button className="panel-footer-button" onClick={() => onNavigate("quotes")}>Abrir todos os orçamentos <ArrowUpRight size={14} /></button>}</section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Leads recentes</h2><p>Atividade mais recente da equipe</p></div>{crm && <button className="text-button" onClick={() => onNavigate("leads")}>Ver todos <ArrowUpRight size={14} /></button>}</div>{crm ? recentLeads.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>CONTATO</th><th>ORIGEM</th><th>ETAPA</th><th>QUALIFICAÇÃO</th><th>DATA</th><th /></tr></thead><tbody>{recentLeads.map((lead) => <tr key={lead.id} onClick={() => onOpenLead(lead)}><td><div className="person-cell"><div className="person-avatar">{initials(lead.full_name)}</div><div><strong>{lead.full_name}</strong><span>{lead.appliance} · {lead.city}</span></div></div></td><td><div className="source-cell"><span className="source-icon"><Megaphone size={13} /></span>{campaigns.find((campaign) => campaign.id === lead.campaign_id)?.name || lead.acquisition_source}</div></td><td><span className={`status-pill ${statusTone(lead.stage)}`}><i />{statusLabel(lead.stage)}</span></td><td>{lead.is_qualified ? <span className="qualified"><Check size={13} /> Qualificado</span> : <span className="muted-label">Em avaliação</span>}</td><td className="date-cell">{shortDate(lead.first_contact_at)}</td><td><button className="row-menu" aria-label="Abrir lead" onClick={(event) => { event.stopPropagation(); onOpenLead(lead); }}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="Sua jornada começa com o primeiro lead" text="Cadastre contatos e acompanhe cada etapa até o serviço ser pago." action={<button className="button button-primary button-small" onClick={onNewLead}><Plus size={15} /> Cadastrar lead</button>} /> : <EmptyState icon={ShieldCheck} title="Funil protegido por perfil" text="Seu perfil acessa os indicadores agregados. Dados pessoais de leads ficam restritos à equipe de vendas e aos administradores." />}</section>
    {analytics && <div className="overview-bottom-grid"><section className="panel campaign-snapshot"><div className="panel-heading"><div><h2>Campanhas</h2><p>Resumo do investimento e resultado</p></div><button className="text-button" onClick={() => onNavigate("campaigns")}>Ver campanhas <ArrowUpRight size={14} /></button></div>{dashboard?.campaigns?.length ? dashboard.campaigns.slice(0, 3).map((campaign) => <CampaignSnapshot key={campaign.id} campaign={campaign} />) : <EmptyMini icon={Megaphone} title="Cadastre sua primeira campanha" text="Relacione os leads com a origem para acompanhar o ROI." />}</section><section className="panel source-note"><div className="source-note-mark"><Sparkles size={18} /></div><div><span className="eyebrow">PONTA A PONTA</span><h2>Mais que cliques: clientes e faturamento</h2><p>Registre leads, contatos, qualificação, orçamentos e pagamentos. Assim, a análise mostra quais campanhas geraram serviço e receita.</p><button className="text-button" onClick={() => onNavigate("analytics")}>Explorar análises <ArrowUpRight size={14} /></button></div></section></div>}
    {loading && <div className="loading-strip" />}
  </>;
}

function StatCard({ label, value, note, icon: Icon, tone, trend }: { label: string; value: string; note: string; icon: typeof CircleDollarSign; tone: string; trend: string }) {
  return <article className="stat-card"><div className="stat-card-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={18} strokeWidth={1.9} /></div></div><strong className="stat-value">{value}</strong><div className="stat-card-bottom"><span>{note}</span><span className={`stat-trend ${tone}`}>{trend}</span></div><div className={`sparkline ${tone}`}><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></article>;
}

function EmptyState({ icon: Icon, title, text, action }: { icon: typeof Users; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function EmptyMini({ icon: Icon, title, text }: { icon: typeof Check; title: string; text: string }) {
  return <div className="empty-mini"><div className="empty-mini-icon"><Icon size={16} /></div><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function LeadsPage({ leads, allCount, search, setSearch, stageFilter, setStageFilter, contacts, campaigns, onNew, onOpen, onStage, onEdit }: { leads: Lead[]; allCount: number; search: string; setSearch: (value: string) => void; stageFilter: string; setStageFilter: (value: string) => void; contacts: Record<string, ContactDraft[]>; campaigns: CampaignOption[]; onNew: () => void; onOpen: (lead: Lead) => void; onStage: (lead: Lead, stage: LeadStage) => void; onEdit: (lead: Lead) => void }) {
  return <><PageHeading eyebrow="RELACIONAMENTO" title="Leads" description={`${allCount} contatos no seu funil de atendimento.`} action={<button className="button button-primary" onClick={onNew}><Plus size={17} /> Novo lead</button>} /><div className="panel list-panel"><div className="list-toolbar"><div className="search-wrap"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone, e-mail ou cidade" /></div><label className="filter-select"><Filter size={15} /><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">Todas as etapas</option>{LEAD_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select><ChevronDown size={13} /></label><span className="table-count">{leads.length} resultados</span></div>{leads.length ? <div className="table-wrap"><table className="data-table lead-table"><thead><tr><th>LEAD</th><th>CONTATO</th><th>ORIGEM / CAMPANHA</th><th>ETAPA</th><th>PRÓXIMO RETORNO</th><th>CADASTRO</th><th /></tr></thead><tbody>{leads.map((lead) => { const channel = contacts[lead.id]?.find((item) => item.is_primary) || contacts[lead.id]?.[0]; const ChannelIcon = contactIcon(channel?.channel || ""); return <tr key={lead.id} onClick={() => onOpen(lead)}><td><div className="person-cell"><div className="person-avatar">{initials(lead.full_name)}</div><div><strong>{lead.full_name}</strong><span>{lead.appliance} · {lead.city}{lead.neighborhood ? `, ${lead.neighborhood}` : ""}</span></div></div></td><td><div className="contact-line"><ChannelIcon size={14} /><span>{channel?.value || lead.phone || lead.email || "Sem contato"}</span></div><span className="contact-secondary">{lead.email || channel?.channel || ""}</span></td><td><div className="campaign-cell"><strong>{campaigns.find((campaign) => campaign.id === lead.campaign_id)?.name || lead.acquisition_source}</strong><span>{lead.acquisition_source}{lead.utm_campaign ? ` · ${lead.utm_campaign}` : ""}</span></div></td><td><select className={`stage-select ${statusTone(lead.stage)}`} value={lead.stage} onClick={(event) => event.stopPropagation()} onChange={(event) => void onStage(lead, event.target.value as LeadStage)}>{LEAD_STAGES.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select></td><td className="date-cell">{lead.next_follow_up_at ? shortDate(lead.next_follow_up_at) : <span className="muted-label">—</span>}</td><td className="date-cell">{shortDate(lead.first_contact_at)}</td><td><button className="row-menu" aria-label="Editar lead" onClick={(event) => { event.stopPropagation(); onEdit(lead); }}><MoreHorizontal size={17} /></button></td></tr>; })}</tbody></table></div> : <EmptyState icon={Search} title="Nenhum lead encontrado" text="Tente alterar a busca ou os filtros, ou cadastre um novo contato." action={<button className="button button-primary button-small" onClick={onNew}><Plus size={15} /> Novo lead</button>} />}</div></>;
}

function QuotesPage({ quotes, leads, onNew, onStatus, onOpenLead }: { quotes: Quote[]; leads: Lead[]; onNew: (lead: Lead) => void; onStatus: (quote: Quote, status: QuoteStatus) => void; onOpenLead: (lead: Lead) => void }) {
  const [filter, setFilter] = useState("open");
  const rows = quotes.filter((quote) => filter === "all" || (filter === "open" ? ["sent", "follow_up", "approved"].includes(quote.status) : quote.status === filter));
  return <><PageHeading eyebrow="ACOMPANHAMENTO COMERCIAL" title="Orçamentos" description="Acompanhe emissão, retorno, aprovação e pagamento de cada proposta." action={<select className="heading-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">Em aberto</option><option value="all">Todos</option>{QUOTE_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>} /><div className="quote-summary-row"><div><span>Em aberto</span><strong>{quotes.filter((item) => ["sent", "follow_up", "approved"].includes(item.status)).length}</strong></div><div><span>Retorno atrasado</span><strong className="text-orange">{quotes.filter((item) => item.next_follow_up_at && new Date(item.next_follow_up_at) < new Date() && !["paid", "rejected", "expired"].includes(item.status)).length}</strong></div><div><span>Pagos</span><strong className="text-green">{quotes.filter((item) => item.status === "paid").length}</strong></div><div><span>Valor emitido</span><strong>{BRL(quotes.filter((item) => !["rejected", "expired"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div></div><div className="panel list-panel"><div className="panel-heading inside-list-heading"><div><h2>Propostas comerciais</h2><p>{rows.length} orçamentos</p></div></div>{rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>ORÇAMENTO</th><th>LEAD</th><th>EMITIDO</th><th>VALOR</th><th>ACOMPANHAR EM</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>{rows.map((quote) => { const lead = leads.find((item) => item.id === quote.lead_id); return <tr key={quote.id} onClick={() => lead && onOpenLead(lead)}><td><div className="campaign-cell"><strong>{quote.quote_number ? `#${quote.quote_number} · ` : ""}{quote.title}</strong><span>{quote.description || "Serviço técnico"}</span></div></td><td>{lead?.full_name || "Lead"}</td><td className="date-cell">{shortDate(quote.issued_at)}</td><td><strong>{BRL(quote.amount)}</strong></td><td className="date-cell">{quote.next_follow_up_at ? shortDate(quote.next_follow_up_at) : "—"}</td><td><span className={`quote-pill quote-${quote.status}`}>{QUOTE_STATUSES.find((item) => item.id === quote.status)?.label}</span></td><td><select className="quote-action" value={quote.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void onStatus(quote, event.target.value as QuoteStatus)} aria-label="Atualizar status do orçamento">{QUOTE_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></td></tr>; })}</tbody></table></div> : <EmptyState icon={FileCheck2} title="Nenhum orçamento nesta lista" text="Abra um lead e registre a proposta para iniciar o acompanhamento." action={leads.length ? <button className="button button-primary button-small" onClick={() => onNew(leads[0])}><Plus size={15} /> Emitir orçamento</button> : undefined} />}</div></>;
}

function CampaignsPage({ role, campaigns, dashboard, onNew, onEdit }: { role: Role; campaigns: Campaign[]; dashboard: DashboardData | null; onNew: () => void; onEdit: (campaign: Campaign) => void }) {
  const editable = canManageCampaigns(role);
  return <><PageHeading eyebrow="MÍDIA E AQUISIÇÃO" title="Campanhas" description="Cadastre as campanhas e acompanhe investimento, leads, vendas e retorno." action={editable ? <button className="button button-primary" onClick={onNew}><Plus size={17} /> Nova campanha</button> : undefined} /><div className="campaign-toolbar-note"><div className="note-icon"><Target size={17} /></div><p>Para calcular o ROI, registre o investimento e associe cada lead à campanha que o trouxe. Atualize as métricas do Ads no período escolhido.</p><span>Dados informados manualmente</span></div>{campaigns.length ? <div className="campaign-grid">{campaigns.map((campaign) => { const result = dashboard?.campaigns.find((item) => item.id === campaign.id); const leads = Number(result?.leads || 0); const qualified = Number(result?.qualified || 0); const won = Number(result?.won || 0); const revenue = Number(result?.revenue || 0); const roi = roiPercent(revenue, Number(campaign.spend_total)); return <article className="campaign-card" key={campaign.id}><div className="campaign-card-head"><div className="campaign-brand"><div className={`campaign-platform platform-${campaign.platform.toLowerCase().replace(/\s/g, "-")}`}>{campaign.platform === "Google Ads" ? "G" : campaign.platform === "Meta Ads" ? "∞" : <Megaphone size={16} />}</div><div><strong>{campaign.name}</strong><span>{campaign.platform}{campaign.external_campaign_id ? ` · ${campaign.external_campaign_id}` : ""}</span></div></div>{editable && <button className="row-menu" onClick={() => onEdit(campaign)} aria-label="Editar campanha"><Settings2 size={16} /></button>}</div><div className="campaign-card-meta"><span className={`campaign-state state-${campaign.status}`}><i />{campaign.status === "active" ? "Ativa" : campaign.status === "paused" ? "Pausada" : "Encerrada"}</span><span>{campaign.target_location}</span><span>{shortDate(campaign.period_start)} – {shortDate(campaign.period_end)}</span></div><div className="campaign-spend-block"><span>Investimento registrado</span><strong>{BRL(campaign.spend_total)}</strong><div className="spend-progress"><i style={{ width: `${campaign.daily_budget > 0 ? Math.min(100, (Number(campaign.spend_total) / (Number(campaign.daily_budget) * 30)) * 100) : 0}%` }} /></div><small>Orçamento diário {BRL(campaign.daily_budget)}</small></div><div className="campaign-metrics"><div><strong>{leads}</strong><span>leads</span></div><div><strong>{qualified}</strong><span>qualificados</span></div><div><strong>{won}</strong><span>clientes</span></div><div><strong>{BRL(revenue)}</strong><span>faturamento</span></div></div><div className="campaign-card-footer"><span>Custo por lead <strong>{leads ? BRL(Number(campaign.spend_total) / leads) : "—"}</strong></span><span>ROI <strong className={roi !== null && roi >= 0 ? "text-green" : "text-orange"}>{roi === null ? "—" : `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`}</strong></span></div>{campaign.landing_page && <a className="campaign-url" href={campaign.landing_page} target="_blank" rel="noreferrer">{campaign.landing_page.replace(/^https?:\/\//, "")} <ArrowUpRight size={12} /></a>}</article>; })}</div> : <div className="panel"><EmptyState icon={Megaphone} title="Cadastre a campanha que trouxe o lead" text="Registre nome, plataforma, identificador, período, orçamento, investimento e resultados. Depois associe cada novo lead à campanha de origem." action={editable ? <button className="button button-primary button-small" onClick={onNew}><Plus size={15} /> Cadastrar campanha</button> : undefined} /></div>}</>;
}

function CampaignSnapshot({ campaign }: { campaign: CampaignSummary }) {
  const roi = roiPercent(campaign.revenue, campaign.spend_total);
  return <div className="snapshot-row"><div className="snapshot-campaign-mark">{campaign.platform === "Google Ads" ? "G" : campaign.platform === "Meta Ads" ? "∞" : "•"}</div><div className="snapshot-campaign"><strong>{campaign.name}</strong><span>{campaign.platform} · {campaign.leads} leads · {campaign.won} clientes</span></div><div className="snapshot-amount"><strong>{BRL(campaign.spend_total)}</strong><span className={roi !== null && roi >= 0 ? "text-green" : "text-orange"}>{roi === null ? "ROI —" : `ROI ${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`}</span></div></div>;
}

function AnalyticsPage({ dashboard, aiAnalysis, aiBusy, onAnalyze }: { dashboard: DashboardData | null; aiAnalysis: string; aiBusy: boolean; onAnalyze: () => void }) {
  const totals = dashboard?.totals;
  const spend = Number(totals?.campaign_spend || 0); const revenue = Number(totals?.revenue || 0);
  const net = revenue - spend; const roi = roiPercent(revenue, spend);
  const rows = dashboard?.campaigns || [];
  const maxRevenue = Math.max(1, ...rows.map((item) => Math.max(item.revenue, item.spend_total)));
  const pipeline = [
    { label: "Leads", value: Number(totals?.leads || 0), color: "#7061e8" },
    { label: "Qualificados", value: Number(totals?.qualified || 0), color: "#2ea98e" },
    { label: "Clientes ganhos", value: Number(totals?.won || 0), color: "#df8b45" },
  ];
  return <><PageHeading eyebrow="ANÁLISE DE RESULTADOS" title="Campanhas e ROI" description="Da verba investida ao faturamento registrado como pago." action={<button className="button button-primary" disabled={aiBusy || !rows.length} onClick={onAnalyze}><Sparkles size={16} />{aiBusy ? "Analisando…" : "Analisar com IA"}</button>} /><div className="roi-banner"><div><span>FATURAMENTO ATRIBUÍDO</span><strong>{BRL(revenue)}</strong></div><div className="roi-banner-divider" /><div><span>INVESTIMENTO</span><strong>{BRL(spend)}</strong></div><div className="roi-banner-divider" /><div><span>RETORNO SOBRE O INVESTIMENTO</span><strong className={roi !== null && roi >= 0 ? "" : "roi-negative"}>{roi === null ? "Aguardando investimento" : `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`}</strong><small>{BRL(net)} {net >= 0 ? "de retorno líquido" : "de saldo negativo"}</small></div><div className="roi-banner-art"><div className="roi-art-line"/><ArrowUpRight size={29}/></div></div><div className="analytics-grid"><section className="panel"><div className="panel-heading"><div><h2>Investimento x faturamento</h2><p>Resultado por campanha cadastrada</p></div></div>{rows.length ? <div className="bar-chart">{rows.map((row) => <div className="bar-row" key={row.id}><div className="bar-label"><strong>{row.name}</strong><span>{row.platform} · {row.leads} leads</span></div><div className="bar-bars"><div className="bar-track"><i className="bar-investment" style={{ width: `${Math.max(3, row.spend_total / maxRevenue * 100)}%` }} /></div><div className="bar-track"><i className="bar-revenue" style={{ width: `${Math.max(3, row.revenue / maxRevenue * 100)}%` }} /></div></div><div className="bar-values"><span>{BRL(row.spend_total)}</span><strong>{BRL(row.revenue)}</strong></div></div>)}<div className="chart-legend"><span><i className="legend-orange"/> Investimento</span><span><i className="legend-purple"/> Faturamento pago</span></div></div> : <EmptyMini icon={Megaphone} title="Sem campanhas para analisar" text="Cadastre suas campanhas e investimento para começar a medir ROI." />}</section><section className="panel funnel-breakdown"><div className="panel-heading"><div><h2>Conversão do funil</h2><p>Da entrada do lead até o pagamento</p></div></div><div className="funnel-stats">{pipeline.map((item) => <div className="funnel-stat-row" key={item.label}><div className="funnel-stat-top"><span>{item.label}</span><strong>{item.value}</strong></div><div className="funnel-track"><i style={{ width: `${Math.max(item.value ? 8 : 0, (item.value / Math.max(1, pipeline[0].value)) * 100)}%`, background: item.color }} /></div><span className="funnel-stat-rate">{pipeline[0].value ? Math.round(item.value / pipeline[0].value * 100) : 0}% dos leads</span></div>)}</div><div className="metric-pair"><div><span>Orçamentos enviados</span><strong>{totals?.quotes_sent || 0}</strong></div><div><span>Orçamentos pagos</span><strong>{totals?.quotes_paid || 0}</strong></div></div><p className="analytics-hint">O faturamento considera apenas orçamentos marcados como pagos. Conversões do Google Ads e clientes reais são acompanhados separadamente.</p></section></div><section className="panel campaign-performance"><div className="panel-heading"><div><h2>Desempenho por campanha</h2><p>Indicadores para conectar mídia e vendas</p></div><span className="privacy-chip"><ShieldCheck size={13} /> Dados agregados</span></div>{rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>CAMPANHA</th><th>GASTO</th><th>LEADS</th><th>QUALIFICADOS</th><th>CLIENTES</th><th>FATURAMENTO</th><th>CUSTO/LEAD</th><th>ROI</th></tr></thead><tbody>{rows.map((row) => { const rowRoi = roiPercent(row.revenue, row.spend_total); return <tr key={row.id}><td><div className="campaign-cell"><strong>{row.name}</strong><span>{row.platform}</span></div></td><td>{BRL(row.spend_total)}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.won}</td><td><strong>{BRL(row.revenue)}</strong></td><td>{row.leads ? BRL(row.spend_total / row.leads) : "—"}</td><td><strong className={rowRoi !== null && rowRoi >= 0 ? "text-green" : "text-orange"}>{rowRoi === null ? "—" : `${rowRoi >= 0 ? "+" : ""}${rowRoi.toFixed(1)}%`}</strong></td></tr>; })}</tbody></table></div> : <EmptyState icon={Gauge} title="Ainda não há dados para o ROI" text="Cadastre uma campanha, registre gasto e associe novos leads a ela. Marque o orçamento como pago quando o serviço for concluído." />}</section>{aiAnalysis && <section className="panel ai-result"><div className="ai-result-heading"><div className="ai-icon"><Sparkles size={17}/></div><div><span className="eyebrow">GOOGLE AI STUDIO</span><h2>Análise das campanhas</h2></div><button className="row-menu" onClick={() => {}}><MoreHorizontal size={17}/></button></div><div className="ai-copy">{aiAnalysis.split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line.replace(/^[-*•]\s*/, "")}</p>)}</div><div className="ai-privacy"><ShieldCheck size={14}/> A análise envia somente números agregados; nomes e contatos de clientes não são enviados ao modelo.</div></section>}</>;
}

function TeamPage({ members, role, session, organizationId, supabase, onInvite, onReload, onNameChange }: { members: Membership[]; role: Role; session: Session; organizationId: string; supabase: SupabaseClient; onInvite: () => void; onReload: () => void; onNameChange: (value: string) => void }) {
  const [name, setName] = useState(""); const [savingName, setSavingName] = useState(false);
  const canAdmin = canManageTeam(role);
  async function saveName() {
    const clean = name.trim(); if (!clean || !canAdmin) return;
    setSavingName(true);
    const { error } = await supabase.from("marketing_organizations").update({ name: clean }).eq("id", organizationId);
    if (error) window.alert(error.message); else { onNameChange(clean); setName(""); }
    setSavingName(false);
  }
  async function changeRole(member: Membership, nextRole: Role) {
    if (!canAdmin || member.role === "owner" || nextRole === "owner") return;
    const { error } = await supabase.from("marketing_memberships").update({ role: nextRole }).eq("id", member.id);
    if (error) window.alert(error.message); else onReload();
  }
  async function removeMember(member: Membership) {
    if (!canAdmin || member.role === "owner" || !window.confirm(`Remover ${member.email || "este membro"} do workspace?`)) return;
    const { error } = await supabase.from("marketing_memberships").delete().eq("id", member.id);
    if (error) window.alert(error.message); else onReload();
  }
  return <><PageHeading eyebrow="CONTROLE DE ACESSO" title="Equipe e permissões" description="Cada pessoa vê apenas as áreas necessárias para sua função." action={canAdmin ? <button className="button button-primary" onClick={onInvite}><Plus size={17}/> Convidar membro</button> : undefined}/><section className="panel access-banner"><div className="access-banner-icon"><ShieldCheck size={20}/></div><div><strong>Segurança aplicada no banco de dados</strong><p>O acesso é isolado por equipe e validado pelo Supabase. Alterar a tela do aplicativo não amplia as permissões de um usuário.</p></div><span className="role-chip">Seu perfil: {ROLE_LABELS[role]}</span></section><div className="team-grid"><section className="panel team-panel"><div className="panel-heading"><div><h2>Membros do workspace</h2><p>{members.length} pessoas com acesso</p></div></div>{members.length ? <div className="team-list">{members.map((member) => <div className="team-member" key={member.id}><div className="person-avatar">{initials(member.email || "U")}</div><div className="member-main"><strong>{member.email || member.user_id}</strong><span>{member.user_id === session.user.id ? "Você · " : ""}{ROLE_DESCRIPTIONS[member.role]}</span></div>{member.role === "owner" ? <span className="owner-chip">Proprietário</span> : canAdmin ? <div className="member-controls"><select value={member.role} onChange={(event) => void changeRole(member, event.target.value as Role)} aria-label="Alterar função do membro">{["admin", "sales", "marketing", "analyst"].map((key) => <option value={key} key={key}>{ROLE_LABELS[key as Role]}</option>)}</select><button className="row-menu" onClick={() => void removeMember(member)} aria-label="Remover membro"><X size={15}/></button></div> : <span className="role-chip">{ROLE_LABELS[member.role]}</span>}</div>)}</div> : <EmptyMini icon={Users} title="Sua equipe ainda está só começando" text="Convide pessoas para acompanhar leads ou campanhas com permissões próprias."/>}</section><section className="panel roles-panel"><div className="panel-heading"><div><h2>Perfis de acesso</h2><p>Permissões por responsabilidade</p></div></div><div className="role-list">{(["admin","sales","marketing","analyst"] as Role[]).map((item) => <div className="role-item" key={item}><div className={`role-dot role-${item}`}/><div><strong>{ROLE_LABELS[item]}</strong><span>{ROLE_DESCRIPTIONS[item]}</span></div></div>)}</div></section></div>{canAdmin && <section className="panel organization-settings"><div><span className="eyebrow">ESPAÇO DE TRABALHO</span><h2>Nome da equipe</h2><p>O nome aparece no menu da equipe.</p></div><div className="inline-form"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da empresa"/><button className="button button-secondary" onClick={() => void saveName()} disabled={!name.trim() || savingName}>{savingName ? "Salvando…" : "Salvar nome"}</button></div></section>}</>;
}

function DialogShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19}/></button></div>{children}</section></div>;
}

function LeadModal({ lead, campaigns, existingContacts, onClose, onSubmit }: { lead: Lead | null; campaigns: CampaignOption[]; existingContacts: ContactDraft[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [contactRows, setContactRows] = useState<ContactDraft[]>(existingContacts.length ? existingContacts : [{ channel: "WhatsApp", value: "", label: "Principal", is_primary: true }]);
  const formSubmit = (event: FormEvent<HTMLFormElement>) => { onSubmit(event); };
  return <DialogShell title={lead ? "Editar lead" : "Cadastrar novo lead"} subtitle="Registre a origem, os dados de contato e o atendimento." onClose={onClose} wide><form className="modal-form" onSubmit={formSubmit}><input type="hidden" name="contacts" value={JSON.stringify(contactRows)}/><div className="form-section-title"><span>01</span><div><strong>Dados do contato</strong><small>Dados principais para atendimento e atribuição</small></div></div><div className="form-grid"><label className="span-2">Nome completo<input name="full_name" defaultValue={lead?.full_name} placeholder="Nome do cliente" required/></label><label>Equipamento<select name="appliance" defaultValue={lead?.appliance || "Geladeira"}>{APPLIANCES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Etapa atual<select name="stage" defaultValue={lead?.stage || "new"}>{LEAD_STAGES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Cidade<input name="city" defaultValue={lead?.city || "Porto Alegre"}/></label><label>Bairro<input name="neighborhood" defaultValue={lead?.neighborhood || ""} placeholder="Ex.: Centro Histórico"/></label><label className="span-2">Descrição do serviço<input name="service_description" defaultValue={lead?.service_description || ""} placeholder="Defeito, urgência ou necessidade do cliente"/></label></div><div className="form-subsection"><strong>Canais de contato e identificadores</strong><p>O valor é o número, e-mail, usuário ou outro identificador do cliente.</p></div>{contactRows.map((contact, index) => <div className="contact-draft-row" key={index}><select value={contact.channel} onChange={(event) => setContactRows((rows) => rows.map((row, idx) => idx === index ? { ...row, channel: event.target.value } : row))}>{CONTACT_CHANNELS.map((item) => <option key={item}>{item}</option>)}</select><input value={contact.value} onChange={(event) => setContactRows((rows) => rows.map((row, idx) => idx === index ? { ...row, value: event.target.value } : row))} placeholder={contact.channel === "E-mail" ? "nome@email.com" : contact.channel === "WhatsApp" || contact.channel === "Ligação telefônica" ? "+55 (51) 99999-9999" : "@usuario ou identificador"} required={index === 0}/><input className="contact-label-input" value={contact.label} onChange={(event) => setContactRows((rows) => rows.map((row, idx) => idx === index ? { ...row, label: event.target.value } : row))} placeholder="Etiqueta opcional"/><label className="primary-check"><input type="radio" checked={contact.is_primary} onChange={() => setContactRows((rows) => rows.map((row, idx) => ({ ...row, is_primary: idx === index })))}/> Principal</label>{contactRows.length > 1 && <button className="remove-contact" type="button" onClick={() => setContactRows((rows) => rows.filter((_, idx) => idx !== index))} aria-label="Remover contato"><X size={15}/></button>}</div>)}<button className="add-contact-button" type="button" onClick={() => setContactRows((rows) => [...rows, { channel: "E-mail", value: "", label: "", is_primary: false }])}><Plus size={14}/> Adicionar outro canal de contato</button><div className="form-section-title section-spaced"><span>02</span><div><strong>Origem e atribuição</strong><small>Campanha de origem separada do canal usado para falar com o lead</small></div></div><div className="form-grid"><label>Origem de aquisição<select name="acquisition_source" defaultValue={lead?.acquisition_source || "Google Ads"}>{ACQUISITION_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Campanha<select name="campaign_id" defaultValue={lead?.campaign_id || ""}><option value="">Sem campanha vinculada</option>{campaigns.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.platform}</option>)}</select></label><label>Canal de contato preferido<select name="preferred_contact_channel" defaultValue={lead?.preferred_contact_channel || contactRows[0]?.channel || "WhatsApp"}>{CONTACT_CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Termo de busca<input name="search_term" defaultValue={lead?.search_term || ""} placeholder="Conserto de geladeira Porto Alegre"/></label><label>UTM source<input name="utm_source" defaultValue={lead?.utm_source || ""} placeholder="google"/></label><label>UTM medium<input name="utm_medium" defaultValue={lead?.utm_medium || lead?.medium || ""} placeholder="cpc"/></label><label>UTM campaign<input name="utm_campaign" defaultValue={lead?.utm_campaign || ""} placeholder="campanha-geladeiras-poa"/></label><label>Landing page<input name="landing_page" defaultValue={lead?.landing_page || ""} placeholder="https://..."/></label><label>GCLID<input name="gclid" defaultValue={lead?.gclid || ""} placeholder="Identificador Google Ads"/></label><label>WBRAID<input name="wbraid" defaultValue={lead?.wbraid || ""} placeholder="Identificador de atribuição"/></label><label>GBRAID<input name="gbraid" defaultValue={lead?.gbraid || ""} placeholder="Identificador de atribuição"/></label></div><div className="form-section-title section-spaced"><span>03</span><div><strong>Qualificação e acompanhamento</strong><small>Esses dados ajudam a medir a qualidade da campanha</small></div></div><div className="form-grid"><label>Primeiro contato<input type="datetime-local" name="first_contact_at" defaultValue={lead?.first_contact_at ? localInputDate(new Date(lead.first_contact_at)) : localInputDate()}/></label><label>Próximo retorno<input type="datetime-local" name="next_follow_up_at" defaultValue={lead?.next_follow_up_at ? localInputDate(new Date(lead.next_follow_up_at)) : ""}/></label><label className="qualification-check"><input type="checkbox" name="is_qualified" defaultChecked={lead?.is_qualified}/> Lead qualificado</label><label className="span-2">Notas da qualificação<textarea name="qualification_notes" defaultValue={lead?.qualification_notes || ""} rows={2} placeholder="Necessidade, perfil e disponibilidade do cliente"/></label><label className="span-2">Observações internas<textarea name="notes" defaultValue={lead?.notes || ""} rows={2} placeholder="Informações úteis para o próximo atendimento"/></label></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary"><Check size={16}/>{lead ? "Salvar alterações" : "Cadastrar lead"}</button></div></form></DialogShell>;
}

function CampaignModal({ campaign, onClose, onSubmit }: { campaign: Campaign | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <DialogShell title={campaign ? "Editar campanha" : "Cadastrar campanha"} subtitle="Registre a origem de aquisição e as métricas do período." onClose={onClose} wide><form className="modal-form" onSubmit={onSubmit}><div className="form-grid"><label className="span-2">Nome da campanha<input name="name" defaultValue={campaign?.name} placeholder="Ex.: Conserto de geladeira — Porto Alegre" required/></label><label>Plataforma<select name="platform" defaultValue={campaign?.platform || "Google Ads"}>{["Google Ads", "Meta Ads", "Orgânico", "Indicação", "Outro"].map((item) => <option key={item}>{item}</option>)}</select></label><label>ID da campanha na plataforma<input name="external_campaign_id" defaultValue={campaign?.external_campaign_id || ""} placeholder="Ex.: 705-771-8486"/></label><label>Objetivo<input name="objective" defaultValue={campaign?.objective || ""} placeholder="Leads de conserto de geladeiras"/></label><label>Área atendida<input name="target_location" defaultValue={campaign?.target_location || "Porto Alegre"}/></label><label className="span-2">URL da landing page<input type="url" name="landing_page" defaultValue={campaign?.landing_page || ""} placeholder="https://suaempresa.com.br/servico"/></label><label>Status<select name="status" defaultValue={campaign?.status || "active"}><option value="active">Ativa</option><option value="paused">Pausada</option><option value="ended">Encerrada</option></select></label><label>Orçamento diário (R$)<input type="number" name="daily_budget" min="0" step="0.01" defaultValue={campaign?.daily_budget || 0}/></label><label>Início do período<input type="date" name="period_start" defaultValue={campaign?.period_start || ""}/></label><label>Fim do período<input type="date" name="period_end" defaultValue={campaign?.period_end || ""}/></label></div><div className="form-section-title section-spaced"><span>↗</span><div><strong>Métricas do período analisado</strong><small>Atualize com os dados do Google Ads ou da plataforma de origem</small></div></div><div className="form-grid four-col"><label>Investimento (R$)<input type="number" name="spend_total" min="0" step="0.01" defaultValue={campaign?.spend_total || 0}/></label><label>Impressões<input type="number" name="impressions" min="0" step="1" defaultValue={campaign?.impressions || 0}/></label><label>Cliques<input type="number" name="clicks" min="0" step="1" defaultValue={campaign?.clicks || 0}/></label><label>Conversões do Ads<input type="number" name="ads_conversions" min="0" step="0.01" defaultValue={campaign?.ads_conversions || 0}/></label><label className="span-2">Notas<textarea name="notes" defaultValue={campaign?.notes || ""} rows={2} placeholder="Observações e período usado como referência"/></label></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary"><Check size={16}/>{campaign ? "Salvar campanha" : "Cadastrar campanha"}</button></div></form></DialogShell>;
}

function QuoteModal({ lead, onClose, onSubmit }: { lead: Lead; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [issuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [followUpAt] = useState(() => localInputDate(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  return <DialogShell title="Emitir orçamento" subtitle={`Proposta para ${lead.full_name} · ${lead.appliance}`} onClose={onClose}><form className="modal-form" onSubmit={onSubmit}><div className="lead-context"><div className="person-avatar">{initials(lead.full_name)}</div><div><strong>{lead.full_name}</strong><span>{lead.city}{lead.neighborhood ? ` · ${lead.neighborhood}` : ""}</span></div></div><label>Título do serviço<input name="title" placeholder="Ex.: Troca do termostato" required/></label><label>Número do orçamento<input name="quote_number" placeholder="Ex.: ORC-2026-014"/></label><label>Valor (R$)<input type="number" name="amount" min="0" step="0.01" required/></label><label>Descrição<textarea name="description" rows={2} placeholder="Serviço, peças e condições"/></label><div className="form-grid"><label>Emitido em<input type="date" name="issued_at" defaultValue={issuedAt}/></label><label>Válido até<input type="date" name="valid_until"/></label><label>Próximo acompanhamento<input type="datetime-local" name="next_follow_up_at" defaultValue={followUpAt}/></label><label>Status inicial<select name="status" defaultValue="sent"><option value="sent">Enviado</option><option value="draft">Rascunho</option></select></label></div><label>Observações internas<textarea name="notes" rows={2}/></label><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary"><Send size={15}/> Registrar orçamento</button></div></form></DialogShell>;
}

function InviteModal({ organizationId, session, onClose, onDone, onError }: { organizationId: string; session: Session; onClose: () => void; onDone: (message: string) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/team/invite", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ organizationId, email: form.get("email"), role: form.get("role") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o convite.");
      onDone(result.message);
    } catch (error) { onError(error instanceof Error ? error.message : "Erro ao enviar o convite."); }
    finally { setBusy(false); }
  }
  return <DialogShell title="Convidar pessoa para a equipe" subtitle="O convite será enviado ao e-mail indicado." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>E-mail profissional<input name="email" type="email" placeholder="pessoa@empresa.com.br" required/></label><label>Perfil de acesso<select name="role" defaultValue="sales">{["admin", "sales", "marketing", "analyst"].map((item) => <option key={item} value={item}>{ROLE_LABELS[item as Role]}</option>)}</select></label><div className="role-explainer"><ShieldCheck size={15}/><span>O membro só poderá acessar os dados e ações permitidos pelo perfil.</span></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}><Mail size={15}/>{busy ? "Enviando…" : "Enviar convite"}</button></div></form></DialogShell>;
}

function LeadDetail({ lead, quotes, activities, contacts, campaign, role, onClose, onAddQuote, onEdit, onStage }: { lead: Lead; quotes: Quote[]; activities: Activity[]; contacts: ContactDraft[]; campaign?: Campaign; role: Role; onClose: () => void; onAddQuote: () => void; onEdit: () => void; onStage: (lead: Lead, stage: LeadStage) => void }) {
  const crm = canManageCrm(role);
  return <div className="modal-backdrop detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="detail-drawer" role="dialog" aria-modal="true"><div className="detail-top"><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button><button className="row-menu" aria-label="Mais ações"><MoreHorizontal size={18}/></button></div><div className="detail-identity"><div className="detail-avatar">{initials(lead.full_name)}</div><div><span className="eyebrow">LEAD · {shortDate(lead.first_contact_at)}</span><h2>{lead.full_name}</h2><p>{lead.appliance} · {lead.city}{lead.neighborhood ? `, ${lead.neighborhood}` : ""}</p></div></div><div className="detail-actions">{crm && <><button className="button button-primary button-small" onClick={onAddQuote}><FilePlus2 size={15}/> Emitir orçamento</button><button className="button button-secondary button-small" onClick={onEdit}>Editar lead</button></>}</div><div className="detail-status-box"><div><span>ETAPA DO FUNIL</span><strong className={`status-pill ${statusTone(lead.stage)}`}><i/>{statusLabel(lead.stage)}</strong></div>{crm && <select className={`stage-select ${statusTone(lead.stage)}`} value={lead.stage} onChange={(event) => void onStage(lead, event.target.value as LeadStage)}>{LEAD_STAGES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>}</div><div className="detail-section"><div className="detail-section-title"><h3>Contato do cliente</h3><span>{lead.preferred_contact_channel}</span></div>{contacts.length ? contacts.map((contact,index)=>{const Icon=contactIcon(contact.channel);return <div className="detail-contact" key={index}><div className="contact-channel-icon"><Icon size={16}/></div><div><span>{contact.channel}{contact.label ? ` · ${contact.label}` : ""}</span><strong>{contact.value}</strong></div>{contact.channel==="E-mail"?<a href={`mailto:${contact.value}`} className="contact-shortcut"><Mail size={15}/></a>:<a href={contact.channel==="WhatsApp"?`https://wa.me/${contact.value.replace(/\D/g,"")}`:`tel:${contact.value}`} target={contact.channel==="WhatsApp"?"_blank":undefined} rel="noreferrer" className="contact-shortcut"><ArrowUpRight size={15}/></a>}</div>}) : <p className="muted-label">Nenhum canal de contato cadastrado.</p>}</div><div className="detail-section"><div className="detail-section-title"><h3>Origem do lead</h3><span className="source-tag"><Megaphone size={12}/>{lead.acquisition_source}</span></div><div className="attribution-card"><strong>{campaign?.name || "Sem campanha vinculada"}</strong><span>{campaign?.platform || lead.acquisition_source}{lead.utm_campaign?` · ${lead.utm_campaign}`:""}</span>{lead.search_term&&<small>Busca: “{lead.search_term}”</small>}</div><div className="attribution-fields">{lead.utm_source&&<span>utm_source <strong>{lead.utm_source}</strong></span>}{lead.utm_medium&&<span>utm_medium <strong>{lead.utm_medium}</strong></span>}{lead.gclid&&<span>GCLID <strong>{lead.gclid}</strong></span>}{lead.landing_page&&<a href={lead.landing_page} target="_blank" rel="noreferrer">Landing page <ArrowUpRight size={11}/></a>}</div></div><div className="detail-section"><div className="detail-section-title"><h3>Orçamentos</h3><span>{quotes.length}</span></div>{quotes.length?quotes.map((quote)=> <div className="detail-quote" key={quote.id}><div className="quote-icon"><FileCheck2 size={16}/></div><div className="detail-quote-content"><strong>{quote.title}</strong><span>{QUOTE_STATUSES.find((item)=>item.id===quote.status)?.label} · {shortDate(quote.issued_at)}</span></div><b>{BRL(quote.amount)}</b></div>):<p className="muted-label">Nenhuma proposta emitida.</p>}</div><div className="detail-section"><div className="detail-section-title"><h3>Histórico de atendimento</h3><span>{activities.length} atividades</span></div><div className="timeline">{activities.slice(0,15).map((activity)=><div className="timeline-item" key={activity.id}><div className="timeline-dot"/><div><strong>{activity.title}</strong>{activity.details&&<p>{activity.details}</p>}<time>{fullDate(activity.created_at)}</time></div></div>)}{!activities.length&&<p className="muted-label">As atualizações e contatos aparecerão aqui.</p>}</div></div>{lead.notes&&<div className="detail-notes"><strong>Observações internas</strong><p>{lead.notes}</p></div>}</section></div>;
}
