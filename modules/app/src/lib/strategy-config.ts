import { CheckCircle2, Clock, XCircle, Timer } from "lucide-react";

export const STATUS_CONFIG = {
  executed: { label: "Executed", icon: CheckCircle2, className: "bg-primary/10 text-primary" },
  pending: { label: "Pending", icon: Clock, className: "bg-warning/10 text-warning" },
  failed: { label: "Failed", icon: XCircle, className: "bg-danger/10 text-danger" },
  timeout: { label: "Timeout", icon: Timer, className: "bg-warning/10 text-warning" },
} as const;
