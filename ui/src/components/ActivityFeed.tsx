import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent, Agent, Issue } from "@paperclipai/shared";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { ActivityRow } from "./ActivityRow";
import { ArtifactFeedCard } from "./ArtifactFeedCard";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ListFilter, Layers } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FilterValue = "all" | "in-progress" | "for-review" | "completed";
type GroupMode = "flat" | "by-task";

const FILTER_OPTIONS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "in-progress", label: "In Progress" },
  { value: "for-review", label: "In Review" },
  { value: "completed", label: "Done" },
];

/** Activity actions that correspond to each filter bucket */
const FILTER_ACTIONS: Record<FilterValue, Set<string> | null> = {
  all: null,
  "in-progress": new Set([
    "issue.created",
    "issue.checked_out",
    "heartbeat.invoked",
  ]),
  "for-review": new Set([
    "approval.created",
    "issue.document_created",
    "issue.document_updated",
  ]),
  completed: new Set([
    "approval.approved",
  ]),
};

/** Actions that also match via issue.updated status details */
const STATUS_FILTER_MAP: Record<FilterValue, Set<string> | null> = {
  all: null,
  "in-progress": new Set(["in_progress"]),
  "for-review": new Set(["in_review"]),
  completed: new Set(["done"]),
};

/** Events that should render as richer artifact cards */
const ARTIFACT_ACTIONS = new Set([
  "issue.document_created",
  "issue.document_updated",
  "approval.created",
]);

/** How many events to show initially (session-weighted) */
const INITIAL_VISIBLE = 50;
const LOAD_MORE_COUNT = 30;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function matchesFilter(event: ActivityEvent, filter: FilterValue): boolean {
  if (filter === "all") return true;

  const actions = FILTER_ACTIONS[filter];
  if (actions?.has(event.action)) return true;

  // Check status changes in issue.updated events
  if (event.action === "issue.updated" && event.details) {
    const statusSet = STATUS_FILTER_MAP[filter];
    const details = event.details as Record<string, unknown>;
    if (statusSet && typeof details.status === "string" && statusSet.has(details.status)) {
      return true;
    }
  }

  return false;
}

function groupByIssue(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const groups = new Map<string, ActivityEvent[]>();
  for (const evt of events) {
    if (evt.entityType === "issue") {
      const existing = groups.get(evt.entityId) ?? [];
      existing.push(evt);
      groups.set(evt.entityId, existing);
    } else {
      // Non-issue events go into an "other" bucket
      const existing = groups.get("__other__") ?? [];
      existing.push(evt);
      groups.set("__other__", existing);
    }
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ActivityFeedProps {
  className?: string;
}

export function ActivityFeed({ className }: ActivityFeedProps) {
  const { selectedCompanyId } = useCompany();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("flat");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch company-level activity, poll every 5s
  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId ?? ""),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  // Fetch agents for name resolution
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? ""),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Fetch issues for name resolution
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId ?? ""),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const i of issues ?? []) {
      map.set(`issue:${i.id}`, i.identifier ?? i.id);
    }
    return map;
  }, [agents, issues]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) {
      map.set(`issue:${i.id}`, i.title);
    }
    return map;
  }, [issues]);

  // Filter and sort events (newest first for the feed)
  const filteredEvents = useMemo(() => {
    const events = (activity ?? [])
      .filter((evt) => matchesFilter(evt, filter))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return events;
  }, [activity, filter]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = filteredEvents.length > visibleCount;

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [filter]);

  // Load more on scroll to bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      setVisibleCount((prev) => prev + LOAD_MORE_COUNT);
    }
  }, [hasMore]);

  const isArtifactEvent = (evt: ActivityEvent) => ARTIFACT_ACTIONS.has(evt.action);

  const renderEvent = (evt: ActivityEvent) => {
    if (isArtifactEvent(evt)) {
      return (
        <ArtifactFeedCard
          key={evt.id}
          event={evt}
          agentMap={agentMap}
          entityNameMap={entityNameMap}
        />
      );
    }
    return (
      <ActivityRow
        key={evt.id}
        event={evt}
        agentMap={agentMap}
        entityNameMap={entityNameMap}
        entityTitleMap={entityTitleMap}
      />
    );
  };

  const renderGrouped = () => {
    const groups = groupByIssue(visibleEvents);
    const entries = Array.from(groups.entries());
    return entries.map(([groupKey, events]) => {
      const isOther = groupKey === "__other__";
      const issueName = entityNameMap.get(`issue:${groupKey}`);
      const issueTitle = entityTitleMap.get(`issue:${groupKey}`);
      const label = isOther
        ? "Other activity"
        : `${issueName ?? groupKey}${issueTitle ? ` — ${issueTitle}` : ""}`;

      return (
        <div key={groupKey} className="mb-3">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-1.5">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {label}
            </p>
          </div>
          {events.map(renderEvent)}
        </div>
      );
    });
  };

  const isEmpty = visibleEvents.length === 0;

  return (
    <aside className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-background", className)}>
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 px-4 py-3 border-b">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Agent Feed</h3>
          <p className="text-xs text-muted-foreground">
            Live activity from your agents
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Group toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={groupMode === "by-task" ? "secondary" : "ghost"}
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                aria-label="group by task"
                onClick={() =>
                  setGroupMode((m) => (m === "flat" ? "by-task" : "flat"))
                }
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {groupMode === "flat" ? "Group by task" : "Show flat"}
            </TooltipContent>
          </Tooltip>

          {/* Filter dropdown */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant={filter !== "all" ? "secondary" : "ghost"}
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground"
                    aria-label="filter by"
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Filter by</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(v) => setFilter(v as FilterValue)}
              >
                {FILTER_OPTIONS.map(({ value, label }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Feed body */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
        onScroll={handleScroll}
      >
        {isEmpty ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 h-full">
            <p className="max-w-[14rem] text-center text-sm text-muted-foreground">
              Activity from your agents will appear here.
            </p>
          </div>
        ) : groupMode === "flat" ? (
          <div className="divide-y">{visibleEvents.map(renderEvent)}</div>
        ) : (
          renderGrouped()
        )}
      </div>
    </aside>
  );
}
