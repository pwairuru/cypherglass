import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export interface AlertRule {
  kind: string;
  threshold: number;
  secondary?: number;
}

export interface Alert {
  id: string;
  chart_id: string;
  metric_id: string;
  rule: AlertRule;
  delivery: { in_app?: boolean; email?: boolean; webhook_url?: string | null };
  is_active: boolean;
  cooldown_seconds: number;
  last_evaluated_at: string | null;
  created_at: string;
}

export interface Layout {
  id: string;
  name: string;
  chart_id: string | null;
  spec: Record<string, unknown>;
  is_default: boolean;
  is_public: boolean;
  updated_at: string;
}

export function useAlerts() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiFetch<Alert[]>("/api/v1/alerts", token ?? undefined),
    enabled: Boolean(token),
  });
  const update = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) =>
      apiFetch<Alert>(`/api/v1/alerts/${input.id}`, token ?? undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: input.is_active }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/alerts/${id}`, token ?? undefined, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
  return { ...query, update, remove };
}

export function useLayouts() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["chart-layouts"],
    queryFn: () => apiFetch<Layout[]>("/api/v1/charts/layouts", token ?? undefined),
    enabled: Boolean(token),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/charts/layouts/${id}`, token ?? undefined, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chart-layouts"] }),
  });
  return { ...query, remove };
}
