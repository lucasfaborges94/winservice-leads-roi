export type Role = "owner" | "admin" | "sales" | "marketing" | "analyst" | "traffic_manager" | `custom:${string}`;
export type LeadStage = "new" | "contacted" | "qualified" | "quote_sent" | "negotiation" | "won" | "lost";
export type QuoteStatus = "draft" | "sent" | "follow_up" | "approved" | "rejected" | "expired" | "paid";

export type CampaignOption = { id: string; name: string; platform: string };
export type Campaign = CampaignOption & {
  organization_id: string;
  manager_user_id: string | null;
  external_campaign_id: string | null;
  objective: string | null;
  landing_page: string | null;
  target_location: string;
  status: "active" | "paused" | "ended";
  period_start: string | null;
  period_end: string | null;
  daily_budget: number;
  spend_total: number;
  impressions: number;
  clicks: number;
  ads_conversions: number;
  notes: string | null;
};

export type Lead = {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  acquisition_source: string;
  preferred_contact_channel: string;
  appliance: string;
  service_description: string | null;
  city: string;
  neighborhood: string | null;
  medium: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
  search_term: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  stage: LeadStage;
  is_qualified: boolean;
  qualification_notes: string | null;
  first_contact_at: string;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  lost_reason: string | null;
  won_revenue: number;
  closed_at: string | null;
  notes: string | null;
};

export type Quote = {
  id: string;
  organization_id: string;
  lead_id: string;
  quote_number: string | null;
  title: string;
  description: string | null;
  amount: number;
  status: QuoteStatus;
  issued_at: string | null;
  valid_until: string | null;
  next_follow_up_at: string | null;
  last_follow_up_at: string | null;
  paid_at: string | null;
  notes: string | null;
};

export type Activity = {
  id: string;
  lead_id: string;
  activity_type: string;
  title: string;
  details: string | null;
  created_at: string;
};

export type CampaignSummary = {
  id: string;
  name: string;
  platform: string;
  status: string;
  spend_total: number;
  impressions: number;
  clicks: number;
  ads_conversions: number;
  period_start: string | null;
  period_end: string | null;
  leads: number;
  qualified: number;
  won: number;
  revenue: number;
};

export type DashboardData = {
  campaigns: CampaignSummary[];
  totals: {
    campaign_spend: number;
    leads: number;
    qualified: number;
    won: number;
    revenue: number;
    quotes_sent: number;
    quotes_paid: number;
  };
};

export const LEAD_STAGES: { id: LeadStage; label: string }[] = [
  { id: "new", label: "Novo lead" },
  { id: "contacted", label: "Em contato" },
  { id: "qualified", label: "Qualificado" },
  { id: "quote_sent", label: "Orçamento enviado" },
  { id: "negotiation", label: "Em negociação" },
  { id: "won", label: "Cliente ganho" },
  { id: "lost", label: "Perdido" },
];

export const QUOTE_STATUSES: { id: QuoteStatus; label: string }[] = [
  { id: "draft", label: "Rascunho" },
  { id: "sent", label: "Enviado" },
  { id: "follow_up", label: "Acompanhar" },
  { id: "approved", label: "Aprovado" },
  { id: "rejected", label: "Recusado" },
  { id: "expired", label: "Expirado" },
  { id: "paid", label: "Pago" },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  sales: "Vendas",
  marketing: "Marketing",
  analyst: "Analista",
  traffic_manager: "Gestor de tráfego",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Acesso completo e controle da equipe",
  admin: "Gerencia leads, campanhas, orçamentos e equipe",
  sales: "Gerencia leads, contatos e orçamentos",
  marketing: "Gerencia campanhas e acompanha resultados agregados",
  analyst: "Consulta campanhas, funil e ROI sem dados pessoais",
  traffic_manager: "Consulta apenas as campanhas atribuídas, com métricas agregadas",
};

export const BRL = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

export const shortDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value))
  : "—";

export const fullDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value))
  : "—";

export const localInputDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

export const roiPercent = (revenue: number, investment: number) => investment > 0
  ? ((revenue - investment) / investment) * 100
  : null;

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export const canManageCrm = (role: Role, permissions: string[] = []) => ["owner", "admin", "sales"].includes(role) || permissions.includes("crm");
export const canManageCampaigns = (role: Role, permissions: string[] = []) => ["owner", "admin", "marketing"].includes(role) || permissions.includes("campaign_manage");
export const canSeeAnalytics = (role: Role, permissions: string[] = []) => ["owner", "admin", "marketing", "analyst", "traffic_manager"].includes(role) || permissions.some((permission) => ["campaign_manage", "analytics"].includes(permission));
export const canManageTeam = (role: Role) => ["owner", "admin"].includes(role);
