import { Link } from "@/lib/router";
import { Identity } from "./Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import type { ActivityEvent, Agent } from "@paperclipai/shared";
import { FileText, GitBranch, CheckCircle2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function actionLabel(action: string): string {
  switch (action) {
    case "issue.document_created":
      return "created a document";
    case "issue.document_updated":
      return "updated a document";
    case "approval.created":
      return "submitted for review";
    case "approval.approved":
      return "approved";
    default:
      return action.replace(/[._]/g, " ");
  }
}

function actionIcon(action: string) {
  switch (action) {
    case "approval.approved":
      return CheckCircle2;
    case "approval.created":
      return GitBranch;
    default:
      return FileText;
  }
}

function statusChip(action: string) {
  switch (action) {
    case "approval.created":
      return {
        label: "For Review",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    case "approval.approved":
      return {
        label: "Approved",
        className: "bg-green-500/10 text-green-600 dark:text-green-400",
      };
    case "issue.document_created":
    case "issue.document_updated":
      return {
        label: "Document",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ArtifactFeedCardProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  className?: string;
}

export function ArtifactFeedCard({
  event,
  agentMap,
  entityNameMap,
  className,
}: ArtifactFeedCardProps) {
  const actor =
    event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName =
    actor?.name ??
    (event.actorType === "system"
      ? "System"
      : event.actorType === "user"
        ? "Board"
        : event.actorId || "Unknown");

  const entityName = entityNameMap.get(`${event.entityType}:${event.entityId}`);
  const details = event.details as Record<string, unknown> | null;
  const docKey = details?.key as string | undefined;
  const summary = details?.summary as string | undefined;

  const Icon = actionIcon(event.action);
  const chip = statusChip(event.action);

  // Link to the issue detail page
  const link =
    event.entityType === "issue"
      ? `/issues/${entityName ?? event.entityId}`
      : null;

  const card = (
    <div
      className={cn(
        "mx-3 my-2 rounded-lg border bg-card p-3 text-sm transition-colors",
        link && "cursor-pointer hover:bg-accent/50",
        className,
      )}
    >
      {/* Top: actor + timestamp */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Identity name={actorName} size="xs" className="shrink-0" />
          <span className="text-muted-foreground truncate">
            {actionLabel(event.action)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {timeAgo(event.createdAt)}
        </span>
      </div>

      {/* Body: icon + title + chip */}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium truncate">
          {docKey ?? entityName ?? event.entityId}
        </span>
        {chip && (
          <span
            className={cn(
              "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight",
              chip.className,
            )}
          >
            {chip.label}
          </span>
        )}
      </div>

      {/* Optional summary preview */}
      {summary && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
          {summary}
        </p>
      )}
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="no-underline text-inherit block">
        {card}
      </Link>
    );
  }

  return card;
}
