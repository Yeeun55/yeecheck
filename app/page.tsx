"use client";

import {
  Archive,
  CalendarDays,
  CalendarRange,
  Check,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Inbox,
  Link2,
  PanelRightClose,
  Pencil,
  Plus,
  Repeat2,
  Settings2,
  Square,
  StickyNote,
  Tag,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ViewMode = "D" | "W" | "2W" | "M";
type BlockType = "event" | "todo" | "time" | "memo";
type Repeat = "none" | "daily" | "weekly" | "monthly";

type AppTag = {
  id: string;
  name: string;
  color: string;
  visible?: boolean;
};

type CalendarBlock = {
  id: string;
  type: BlockType;
  title: string;
  date: string | null;
  endDate?: string | null;
  tags: string[];
  completed?: boolean;
  repeat?: Repeat;
  parentId?: string | null;
  startTime?: string;
  endTime?: string;
};

type CreateBlockOptions = {
  beforeId?: string;
  afterId?: string;
  parentId?: string | null;
};

type AppData = {
  version: number;
  showBlockTags?: boolean;
  tags: AppTag[];
  blocks: CalendarBlock[];
};

const EMPTY_DATA: AppData = {
  version: 3,
  showBlockTags: true,
  tags: [],
  blocks: [],
};
const STORAGE_KEY = "yeecheck.data.v1";

const TAG_COLORS = [
  "#d95c4f",
  "#df8a3d",
  "#d1aa37",
  "#67a35f",
  "#3f9a8b",
  "#4f86c6",
  "#6d70c9",
  "#9566b8",
  "#c35f8d",
  "#8b6b55",
];

const BLOCK_META: Record<
  BlockType,
  { icon: LucideIcon; accent: string }
> = {
  event: { icon: CalendarRange, accent: "#1f1f1f" },
  todo: { icon: CheckSquare2, accent: "#4b4b4b" },
  time: { icon: Clock3, accent: "#737373" },
  memo: { icon: StickyNote, accent: "#a3a3a3" },
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(0, 0, 0, 0);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function diffDays(start: string, end: string) {
  return Math.max(
    0,
    Math.round(
      (fromDateKey(end).getTime() - fromDateKey(start).getTime()) / 86_400_000,
    ),
  );
}

function rangeForView(anchor: Date, view: ViewMode) {
  if (view === "D") return [new Date(anchor)];
  if (view === "W") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  if (view === "2W") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 14 }, (_, index) => addDays(start, index));
  }

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(monthStart);
  const endDay = monthEnd.getDay() === 0 ? 6 : monthEnd.getDay() - 1;
  const gridEnd = addDays(monthEnd, 6 - endDay);
  const length =
    Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  return Array.from({ length }, (_, index) => addDays(gridStart, index));
}

function uid() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function blockKey(id: string, location: string | null) {
  return `${id}@${location ?? "inbox"}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

function formatTimeRange(block: CalendarBlock) {
  return `${block.startTime ?? "09:00"} ~ ${block.endTime ?? "10:00"}`;
}

function parseTimeRange(value: string) {
  const match = value.match(
    /^\s*(\d{1,2}):(\d{2})\s*[~～-]\s*(\d{1,2}):(\d{2})\s*$/,
  );
  if (!match) return null;
  const [, startHour, startMinute, endHour, endMinute] = match.map(Number);
  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59
  ) {
    return null;
  }
  return {
    startTime: `${pad(startHour)}:${pad(startMinute)}`,
    endTime: `${pad(endHour)}:${pad(endMinute)}`,
  };
}

function orderTodoBlocks(items: CalendarBlock[]) {
  const ids = new Set(items.map((block) => block.id));
  const children = new Map<string, CalendarBlock[]>();
  const roots: CalendarBlock[] = [];

  items.forEach((block) => {
    if (block.parentId && ids.has(block.parentId)) {
      const siblings = children.get(block.parentId) ?? [];
      siblings.push(block);
      children.set(block.parentId, siblings);
    } else {
      roots.push(block);
    }
  });

  const result: CalendarBlock[] = [];
  const visited = new Set<string>();
  function visit(block: CalendarBlock) {
    if (visited.has(block.id)) return;
    visited.add(block.id);
    result.push(block);
    (children.get(block.id) ?? []).forEach(visit);
  }
  roots.forEach(visit);
  items.forEach(visit);
  return result;
}

function normalizeData(value: AppData): AppData {
  return {
    ...value,
    version: 3,
    showBlockTags: value.showBlockTags !== false,
    tags: value.tags.map((tagItem) => ({
      ...tagItem,
      visible: tagItem.visible !== false,
    })),
  };
}

function IconButton({
  label,
  children,
  className = "",
  ...props
}: {
  label: string;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>("W");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagEditing, setTagEditing] = useState(false);
  const [tagPopoverId, setTagPopoverId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [titleEditingKey, setTitleEditingKey] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [timeEditingKey, setTimeEditingKey] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState("");
  const [popoverKey, setPopoverKey] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const tagEditSnapshotRef = useRef<AppData | null>(null);
  const tagFilterSnapshotRef = useRef<string[]>([]);
  const skipTitleBlurRef = useRef<string | null>(null);
  const skipTimeBlurRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppData;
          if (active) setData(normalizeData(parsed));
        } else {
          const response = await fetch("/data.json");
          const parsed = (await response.json()) as AppData;
          if (active) setData(normalizeData(parsed));
        }
      } catch {
        if (active) setData(EMPTY_DATA);
      } finally {
        if (active) setLoaded(true);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, loaded]);

  useEffect(() => {
    if (!popoverKey) return;

    function closePopover(event: MouseEvent) {
      const target = event.target as Element | null;
      const blockRoot = target?.closest("[data-block-id]");
      if (blockRoot?.getAttribute("data-block-key") !== popoverKey) {
        setPopoverKey(null);
      }
    }

    document.addEventListener("mousedown", closePopover);
    return () => document.removeEventListener("mousedown", closePopover);
  }, [popoverKey]);

  const dates = useMemo(() => rangeForView(anchor, view), [anchor, view]);
  const todayKey = toDateKey(new Date());
  const editingTag = data.tags.find((tagItem) => tagItem.id === tagPopoverId);

  const visibleBlocks = useMemo(() => {
    if (selectedTags.length === 0) return data.blocks;
    return data.blocks.filter((block) =>
      selectedTags.every((tagId) => block.tags.includes(tagId)),
    );
  }, [data.blocks, selectedTags]);

  function visibleBlockElements() {
    return Array.from(
      document.querySelectorAll<HTMLElement>(".block-item[data-block-key]"),
    ).filter((element) => {
      const sidebar = element.closest(".inbox-sidebar");
      return !sidebar || sidebar.classList.contains("is-open");
    });
  }

  function blockElement(key: string) {
    return visibleBlockElements().find(
      (element) => element.dataset.blockKey === key,
    );
  }

  function focusBlock(key: string | null) {
    if (!key) return;
    window.setTimeout(() => blockElement(key)?.focus(), 0);
  }

  function focusTitle(key: string) {
    window.setTimeout(() => {
      const input = blockElement(key)?.querySelector<HTMLInputElement>(
        ".block-title:not([readonly])",
      );
      input?.focus();
      input?.select();
    }, 0);
  }

  function moveSelection(direction: -1 | 1) {
    if (!selectedKey) return;
    const elements = visibleBlockElements();
    const currentIndex = elements.findIndex(
      (element) => element.dataset.blockKey === selectedKey,
    );
    const next = elements[currentIndex + direction];
    if (!next?.dataset.blockKey) return;
    setSelectedKey(next.dataset.blockKey);
    next.focus();
  }

  function beginTitleEditing(block: CalendarBlock, instanceKey: string) {
    setSelectedKey(instanceKey);
    setPopoverKey(null);
    setTimeEditingKey(null);
    setTitleDraft(block.title);
    setTitleEditingKey(instanceKey);
    focusTitle(instanceKey);
  }

  function nextKeyAfterDelete(instanceKey: string, deletedId: string) {
    const elements = visibleBlockElements();
    const currentIndex = elements.findIndex(
      (element) => element.dataset.blockKey === instanceKey,
    );
    const candidates = [
      ...elements.slice(currentIndex + 1),
      ...elements.slice(0, currentIndex).reverse(),
    ];
    return candidates.find((element) => element.dataset.blockId !== deletedId)
      ?.dataset.blockKey ?? null;
  }

  function updateBlock(id: string, patch: Partial<CalendarBlock>) {
    setData((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  }

  function createBlock(
    type: BlockType,
    date: string | null,
    options: CreateBlockOptions = {},
  ) {
    const id = uid();
    const instanceKey = blockKey(id, date);
    const block: CalendarBlock = {
      id,
      type,
      title: "",
      date,
      tags: [],
      ...(type === "event" ? { endDate: date } : {}),
      ...(type === "todo"
        ? {
            completed: false,
            repeat: "none" as Repeat,
            parentId: options.parentId ?? null,
          }
        : {}),
      ...(type === "time" ? { startTime: "09:00", endTime: "10:00" } : {}),
    };

    setData((current) => {
      const blocks = [...current.blocks];
      const beforeIndex = options.beforeId
        ? blocks.findIndex((candidate) => candidate.id === options.beforeId)
        : -1;
      const afterIndex = options.afterId
        ? blocks.findIndex((candidate) => candidate.id === options.afterId)
        : -1;
      if (beforeIndex >= 0) blocks.splice(beforeIndex, 0, block);
      else if (afterIndex >= 0) blocks.splice(afterIndex + 1, 0, block);
      else blocks.push(block);
      return { ...current, blocks };
    });
    setSelectedKey(instanceKey);
    setTitleDraft("");
    setTitleEditingKey(instanceKey);
    setTimeEditingKey(null);
    setPopoverKey(null);
    focusTitle(instanceKey);
  }

  function deleteBlock(id: string, instanceKey = selectedKey) {
    const nextKey = instanceKey ? nextKeyAfterDelete(instanceKey, id) : null;
    setData((current) => ({
      ...current,
      blocks: current.blocks
        .filter((block) => block.id !== id)
        .map((block) =>
          block.parentId === id ? { ...block, parentId: null } : block,
        ),
    }));
    setPopoverKey(null);
    setTitleEditingKey(null);
    setTimeEditingKey(null);
    setSelectedKey(nextKey);
    focusBlock(nextKey);
  }

  function finishTitleEditing(
    block: CalendarBlock,
    location: string | null,
    createNext: boolean,
  ) {
    updateBlock(block.id, { title: titleDraft });
    setTitleEditingKey(null);
    if (createNext) {
      createBlock(block.type, location, {
        afterId: block.id,
        parentId: block.type === "todo" ? block.parentId ?? null : undefined,
      });
    }
  }

  function cancelTitleEditing(instanceKey: string) {
    skipTitleBlurRef.current = instanceKey;
    setTitleEditingKey(null);
    setTitleDraft("");
    focusBlock(instanceKey);
  }

  function beginTimeEditing(block: CalendarBlock, instanceKey: string) {
    setSelectedKey(instanceKey);
    setTitleEditingKey(null);
    setPopoverKey(null);
    setTimeDraft(formatTimeRange(block));
    setTimeEditingKey(instanceKey);
    window.setTimeout(() => {
      const input = blockElement(instanceKey)?.querySelector<HTMLInputElement>(
        ".time-input",
      );
      input?.focus();
      input?.select();
    }, 0);
  }

  function finishTimeEditing(block: CalendarBlock, instanceKey: string) {
    const parsed = parseTimeRange(timeDraft);
    if (!parsed) return false;
    skipTimeBlurRef.current = instanceKey;
    updateBlock(block.id, parsed);
    setTimeEditingKey(null);
    setTimeDraft("");
    focusBlock(instanceKey);
    return true;
  }

  function cancelTimeEditing(instanceKey: string) {
    skipTimeBlurRef.current = instanceKey;
    setTimeEditingKey(null);
    setTimeDraft("");
    focusBlock(instanceKey);
  }

  function adjustTimeWithArrow(
    block: CalendarBlock,
    input: HTMLInputElement,
    direction: -1 | 1,
  ) {
    const parsed = parseTimeRange(timeDraft) ?? {
      startTime: block.startTime ?? "09:00",
      endTime: block.endTime ?? "10:00",
    };
    const cursor = input.selectionStart ?? 0;
    const segment = cursor < 3 ? 0 : cursor < 8 ? 1 : cursor < 11 ? 2 : 3;
    const startMinutes = timeToMinutes(parsed.startTime);
    const endMinutes = timeToMinutes(parsed.endTime);
    const step = segment === 0 || segment === 2 ? 60 : 10;
    const nextStart =
      segment < 2 ? minutesToTime(startMinutes + direction * step) : parsed.startTime;
    const nextEnd =
      segment >= 2 ? minutesToTime(endMinutes + direction * step) : parsed.endTime;
    const nextValue = `${nextStart} ~ ${nextEnd}`;
    const ranges = [
      [0, 2],
      [3, 5],
      [8, 10],
      [11, 13],
    ];
    setTimeDraft(nextValue);
    window.setTimeout(() => {
      input.setSelectionRange(ranges[segment][0], ranges[segment][1]);
    }, 0);
  }

  function moveBlock(
    id: string,
    date: string | null,
    type?: BlockType,
    beforeId?: string,
    parentId?: string | null,
  ) {
    setData((current) => {
      const moving = current.blocks.find((block) => block.id === id);
      if (!moving || (type && moving.type !== type)) return current;

      const descendantIds = new Set<string>();
      if (moving.type === "todo") {
        let added = true;
        while (added) {
          added = false;
          current.blocks.forEach((candidate) => {
            if (
              candidate.parentId &&
              (candidate.parentId === id || descendantIds.has(candidate.parentId)) &&
              !descendantIds.has(candidate.id)
            ) {
              descendantIds.add(candidate.id);
              added = true;
            }
          });
        }
      }
      if (parentId && (parentId === id || descendantIds.has(parentId))) {
        return current;
      }

      const duration =
        moving.type === "event" && moving.date && moving.endDate
          ? diffDays(moving.date, moving.endDate)
          : 0;
      const groupIds = new Set([id, ...descendantIds]);
      const movedGroup = current.blocks
        .filter((block) => groupIds.has(block.id))
        .map((block) => ({
          ...block,
          date,
          ...(block.id === id && moving.type === "todo"
            ? { parentId: parentId ?? null }
            : {}),
          ...(block.id === id && moving.type === "event"
            ? {
                endDate: date
                  ? toDateKey(addDays(fromDateKey(date), duration))
                  : null,
              }
            : {}),
        }));
      const remaining = current.blocks.filter(
        (block) => !groupIds.has(block.id),
      );
      const beforeIndex = beforeId
        ? remaining.findIndex((block) => block.id === beforeId)
        : -1;
      const parentIndex = parentId
        ? remaining.findIndex((block) => block.id === parentId)
        : -1;
      if (beforeIndex >= 0) remaining.splice(beforeIndex, 0, ...movedGroup);
      else if (parentIndex >= 0)
        remaining.splice(parentIndex + 1, 0, ...movedGroup);
      else remaining.push(...movedGroup);
      return { ...current, blocks: remaining };
    });
  }

  function handleSectionDrop(
    event: DragEvent,
    date: string | null,
    type?: BlockType,
    beforeId?: string,
  ) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    if (id) {
      moveBlock(id, date, type, beforeId, type === "todo" ? null : undefined);
    }
    setDraggedId(null);
  }

  function handleTodoNestDrop(event: DragEvent, parent: CalendarBlock) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    if (id) moveBlock(id, parent.date, "todo", undefined, parent.id);
    setDraggedId(null);
  }

  function blocksFor(date: string, type: BlockType) {
    const items = visibleBlocks.filter((block) => {
      if (block.type !== type || !block.date) return false;
      if (type === "event" && block.endDate) {
        return date >= block.date && date <= block.endDate;
      }
      return block.date === date;
    });

    if (type === "time") {
      return items.sort((a, b) =>
        (a.startTime ?? "").localeCompare(b.startTime ?? ""),
      );
    }
    return type === "todo" ? orderTodoBlocks(items) : items;
  }

  function navigate(direction: -1 | 1) {
    if (view === "D") setAnchor((current) => addDays(current, direction));
    if (view === "W") setAnchor((current) => addDays(current, direction * 7));
    if (view === "2W") setAnchor((current) => addDays(current, direction * 14));
    if (view === "M") setAnchor((current) => addMonths(current, direction));
  }

  function toggleTagFilter(tagId: string) {
    setSelectedTags((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  }

  function startTagEditing() {
    tagEditSnapshotRef.current = JSON.parse(JSON.stringify(data)) as AppData;
    tagFilterSnapshotRef.current = [...selectedTags];
    setTagEditing(true);
    setTagPopoverId(null);
  }

  function cancelTagEditing() {
    if (tagEditSnapshotRef.current) setData(tagEditSnapshotRef.current);
    setSelectedTags(tagFilterSnapshotRef.current);
    tagEditSnapshotRef.current = null;
    setTagPopoverId(null);
    setTagEditing(false);
  }

  function finishTagEditing() {
    tagEditSnapshotRef.current = null;
    setTagPopoverId(null);
    setTagEditing(false);
  }

  function createTag() {
    const id = `tag-${Date.now()}`;
    setData((current) => ({
      ...current,
      tags: [
        ...current.tags,
        { id, name: "", color: TAG_COLORS[4], visible: true },
      ],
    }));
    setTagPopoverId(id);
  }

  function updateTag(id: string, patch: Partial<AppTag>) {
    setData((current) => ({
      ...current,
      tags: current.tags.map((tagItem) =>
        tagItem.id === id ? { ...tagItem, ...patch } : tagItem,
      ),
    }));
  }

  function deleteTag(id: string) {
    setData((current) => ({
      ...current,
      tags: current.tags.filter((tagItem) => tagItem.id !== id),
      blocks: current.blocks.map((block) => ({
        ...block,
        tags: block.tags.filter((tagId) => tagId !== id),
      })),
    }));
    setSelectedTags((current) => current.filter((tagId) => tagId !== id));
    setTagPopoverId(null);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "yeecheck-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData;
        if (Array.isArray(parsed.blocks) && Array.isArray(parsed.tags)) {
          setData(normalizeData(parsed));
        }
      } catch {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function renderBlockPopover(block: CalendarBlock) {
    const TypeIcon = BLOCK_META[block.type].icon;

    return (
      <section
        className="block-popover"
        role="dialog"
        aria-label="블록 속성"
        onDragStart={(event) => event.stopPropagation()}
      >
        <div className="popover-header">
          <TypeIcon size={15} aria-hidden="true" />
          <IconButton label="닫기" onClick={() => setPopoverKey(null)}>
            <X size={14} />
          </IconButton>
        </div>

        <div className="popover-field">
          <CalendarDays size={14} aria-hidden="true" />
          <div className="popover-date-range">
            <input
              type="date"
              aria-label="날짜"
              value={block.date ?? ""}
              onChange={(event) => {
                const nextDate = event.target.value || null;
                const duration =
                  block.type === "event" && block.date && block.endDate
                    ? diffDays(block.date, block.endDate)
                    : 0;
                updateBlock(block.id, {
                  date: nextDate,
                  ...(block.type === "event"
                    ? {
                        endDate: nextDate
                          ? toDateKey(addDays(fromDateKey(nextDate), duration))
                          : null,
                      }
                    : {}),
                });
              }}
            />
            {block.type === "event" && (
              <input
                type="date"
                aria-label="끝 날짜"
                min={block.date ?? undefined}
                value={block.endDate ?? ""}
                onChange={(event) =>
                  updateBlock(block.id, {
                    endDate: event.target.value || block.date,
                  })
                }
              />
            )}
          </div>
        </div>

        {block.type === "todo" && (
          <div className="popover-field">
            <Repeat2 size={14} aria-hidden="true" />
            <select
              aria-label="반복"
              value={block.repeat ?? "none"}
              onChange={(event) =>
                updateBlock(block.id, {
                  repeat: event.target.value as Repeat,
                })
              }
            >
              <option value="none">—</option>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>
          </div>
        )}

        <div className="popover-tags" aria-label="태그">
          <Tag size={14} aria-hidden="true" />
          <div className="popover-tag-list">
            {data.tags.map((tagItem) => {
              const selected = block.tags.includes(tagItem.id);
              return (
                <button
                  type="button"
                  key={tagItem.id}
                  className={`tag-chip ${selected ? "is-active" : ""}`}
                  aria-pressed={selected}
                  onClick={() =>
                    updateBlock(block.id, {
                      tags: selected
                        ? block.tags.filter((id) => id !== tagItem.id)
                        : [...block.tags, tagItem.id],
                    })
                  }
                >
                  <span
                    className="tag-dot"
                    style={{ backgroundColor: tagItem.color }}
                    aria-hidden="true"
                  />
                  {tagItem.name || "·"}
                </button>
              );
            })}
          </div>
        </div>

      </section>
    );
  }

  function renderBlockItem(
    block: CalendarBlock,
    compact: boolean,
    location: string | null,
  ) {
    const instanceKey = blockKey(block.id, location);
    const blockTags =
      data.showBlockTags === false
        ? []
        : data.tags.filter(
            (tagItem) =>
              block.tags.includes(tagItem.id) && tagItem.visible !== false,
          );
    const isChild = block.type === "todo" && Boolean(block.parentId);
    const isTime = block.type === "time";
    const isSelected = selectedKey === instanceKey;
    const isTitleEditing = titleEditingKey === instanceKey;
    const isTimeEditing = timeEditingKey === instanceKey;

    return (
      <div
        key={instanceKey}
        className={`block-item ${block.completed ? "is-complete" : ""} ${isChild ? "is-child" : ""} ${isTime ? "is-time" : ""} ${isSelected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${block.title || "빈 블록"} 선택`}
        draggable={
          !isTitleEditing && !isTimeEditing && popoverKey !== instanceKey
        }
        data-block-id={block.id}
        data-block-key={instanceKey}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", block.id);
          setDraggedId(block.id);
        }}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          if (block.type === "todo") handleTodoNestDrop(event, block);
          else {
            event.stopPropagation();
            handleSectionDrop(event, location, block.type, block.id);
          }
        }}
        onClick={(event) => {
          const target = event.target as Element;
          if (
            target.closest("button, select") ||
            (isTitleEditing && target.closest(".block-title")) ||
            (isTimeEditing && target.closest(".time-input"))
          ) {
            return;
          }
          setSelectedKey(instanceKey);
          event.currentTarget.focus();
        }}
        onDoubleClick={(event) => {
          if ((event.target as Element).closest(".block-title")) {
            beginTitleEditing(block, instanceKey);
          }
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            beginTitleEditing(block, instanceKey);
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            deleteBlock(block.id, instanceKey);
          }
        }}
      >
        <GripVertical className="drag-handle" size={13} aria-hidden="true" />
        {block.type === "todo" && (
          <IconButton
            label={block.completed ? "완료 취소" : "완료"}
            className="block-check"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedKey(instanceKey);
              updateBlock(block.id, { completed: !block.completed });
            }}
          >
            {block.completed ? <CheckSquare2 size={15} /> : <Square size={15} />}
          </IconButton>
        )}

        {isTime &&
          (isTimeEditing ? (
            <input
              className="time-input"
              aria-label="시간 범위"
              aria-invalid={parseTimeRange(timeDraft) === null}
              value={timeDraft}
              onChange={(event) => setTimeDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  adjustTimeWithArrow(
                    block,
                    event.currentTarget,
                    event.key === "ArrowUp" ? 1 : -1,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  finishTimeEditing(block, instanceKey);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTimeEditing(instanceKey);
                }
              }}
              onBlur={() => {
                if (skipTimeBlurRef.current === instanceKey) {
                  skipTimeBlurRef.current = null;
                  return;
                }
                const parsed = parseTimeRange(timeDraft);
                if (parsed) updateBlock(block.id, parsed);
                setTimeEditingKey(null);
                setTimeDraft("");
              }}
            />
          ) : (
            <button
              type="button"
              className="time-cell"
              aria-label={`${formatTimeRange(block)} 수정`}
              onClick={(event) => {
                event.stopPropagation();
                beginTimeEditing(block, instanceKey);
              }}
            >
              {formatTimeRange(block)}
            </button>
          ))}

        <div className="block-main">
          <div className="block-title-row">
            <input
              className="block-title"
              data-block-title={block.id}
              aria-label="블록 내용"
              readOnly={!isTitleEditing}
              tabIndex={isTitleEditing ? 0 : -1}
              value={isTitleEditing ? titleDraft : block.title}
              onChange={(event) => setTitleDraft(event.target.value)}
              onClick={(event) => {
                if (isTitleEditing) event.stopPropagation();
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  skipTitleBlurRef.current = instanceKey;
                  finishTitleEditing(block, location, true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTitleEditing(instanceKey);
                }
              }}
              onBlur={() => {
                if (skipTitleBlurRef.current === instanceKey) {
                  skipTitleBlurRef.current = null;
                  return;
                }
                if (titleEditingKey === instanceKey) {
                  finishTitleEditing(block, location, false);
                }
              }}
            />
            {block.type === "todo" && block.repeat !== "none" && (
              <Repeat2 className="repeat-mark" size={11} aria-hidden="true" />
            )}
            {block.type === "todo" && block.parentId && (
              <Link2 className="parent-mark" size={11} aria-hidden="true" />
            )}
          </div>
          {blockTags.length > 0 && (
            <div className="block-tag-dots" aria-label="태그">
              {blockTags.map((tagItem) => (
                <span
                  className="block-tag-dot"
                  key={tagItem.id}
                  style={{ backgroundColor: tagItem.color }}
                  aria-label={tagItem.name}
                />
              ))}
            </div>
          )}
        </div>

        <IconButton
          label="블록 속성"
          className={`block-settings ${popoverKey === instanceKey ? "is-active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedKey(instanceKey);
            setTitleEditingKey(null);
            setTimeEditingKey(null);
            setPopoverKey((current) =>
              current === instanceKey ? null : instanceKey,
            );
          }}
        >
          <Settings2 size={13} />
        </IconButton>

        <IconButton
          label="블록 삭제"
          className="block-delete delete-button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedKey(instanceKey);
            deleteBlock(block.id, instanceKey);
          }}
        >
          <Trash2 size={13} />
        </IconButton>

        {popoverKey === instanceKey && renderBlockPopover(block)}
      </div>
    );
  }

  function renderInsertGap(
    type: BlockType,
    date: string | null,
    beforeBlock?: CalendarBlock,
    compact = false,
  ) {
    const gapKey = `${type}-${date ?? "inbox"}-${beforeBlock?.id ?? "end"}`;
    return (
      <button
        type="button"
        key={gapKey}
        className={`insert-gap ${compact ? "is-compact" : ""}`}
        aria-label="이 위치에 블록 추가"
        onClick={(event) => {
          event.stopPropagation();
          createBlock(type, date, {
            beforeId: beforeBlock?.id,
            parentId:
              type === "todo" ? beforeBlock?.parentId ?? null : undefined,
          });
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.stopPropagation();
          handleSectionDrop(event, date, type, beforeBlock?.id);
        }}
      >
        <Plus size={compact ? 8 : 10} aria-hidden="true" />
      </button>
    );
  }

  function renderSection(type: BlockType, date: string, compact = false) {
    const items = blocksFor(date, type);
    const TypeIcon = BLOCK_META[type].icon;
    const sectionRows: ReactNode[] = [];
    items.forEach((block) => {
      sectionRows.push(renderInsertGap(type, date, block, compact));
      sectionRows.push(renderBlockItem(block, compact, date));
    });
    sectionRows.push(renderInsertGap(type, date, undefined, compact));

    return (
      <section
        className={`day-section section-${type}`}
        aria-label={type}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => handleSectionDrop(event, date, type)}
      >
        <div className="section-rail">
          <TypeIcon size={compact ? 12 : 14} aria-hidden="true" />
          <IconButton
            label="블록 추가"
            className="section-add"
            onClick={() => createBlock(type, date)}
          >
            <Plus size={compact ? 11 : 13} />
          </IconButton>
        </div>
        <div className="section-blocks">
          {sectionRows}
        </div>
      </section>
    );
  }

  function renderDayColumn(date: Date) {
    const dateKey = toDateKey(date);
    const isOutsideMonth = view === "M" && date.getMonth() !== anchor.getMonth();
    const compact = view === "M";

    return (
      <article
        key={dateKey}
        className={`day-column ${dateKey === todayKey ? "is-today" : ""} ${isOutsideMonth ? "is-outside" : ""}`}
      >
        <button
          type="button"
          className="day-heading"
          aria-label={`${dateKey} 하루 보기`}
          onClick={() => {
            setAnchor(date);
            if (view === "M") setView("D");
          }}
        >
          <span className="weekday">{WEEKDAYS[(date.getDay() + 6) % 7]}</span>
          <span className="date-number">{pad(date.getDate())}</span>
        </button>
        <div className="day-content">
          {renderSection("event", dateKey, compact)}
          {renderSection("todo", dateKey, compact)}
          {renderSection("time", dateKey, compact)}
          {renderSection("memo", dateKey, compact)}
        </div>
      </article>
    );
  }

  const rangeLabel =
    view === "M"
      ? `${anchor.getFullYear()}.${pad(anchor.getMonth() + 1)}`
      : dates.length === 1
        ? toDateKey(dates[0]).replaceAll("-", ".")
        : `${toDateKey(dates[0]).slice(5).replace("-", ".")} — ${toDateKey(dates[dates.length - 1]).slice(5).replace("-", ".")}`;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-topline">
          <div className="view-switcher" role="group" aria-label="달력 범위">
            {(["D", "W", "2W", "M"] as ViewMode[]).map((mode) => (
              <button
                type="button"
                key={mode}
                className={view === mode ? "is-active" : ""}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="date-navigation">
            <IconButton label="이전" onClick={() => navigate(-1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <button
              type="button"
              className="range-label"
              aria-label="오늘"
              onClick={() => setAnchor(new Date())}
            >
              {rangeLabel}
            </button>
            <IconButton label="다음" onClick={() => navigate(1)}>
              <ChevronRight size={17} />
            </IconButton>
          </div>

          <IconButton
            label="보관함"
            className={sidebarOpen ? "is-active" : ""}
            onClick={() => setSidebarOpen(true)}
          >
            <Archive size={18} />
          </IconButton>
        </div>

        <div className="tag-area">
          <div
            className="tag-strip"
            aria-label={tagEditing ? "태그 편집" : "태그 필터"}
          >
            <IconButton
              label={tagEditing ? "태그 선택 해제" : "태그 필터 해제"}
              className={
                selectedTags.length === 0 && !tagEditing
                  ? "tag-all is-active"
                  : "tag-all"
              }
              onClick={() => {
                if (tagEditing) setTagPopoverId(null);
                else setSelectedTags([]);
              }}
            >
              <Tag size={14} />
            </IconButton>
            <IconButton
              label={
                data.showBlockTags === false
                  ? "모든 블록에 태그 표시"
                  : "모든 블록에서 태그 숨기기"
              }
              className={`tag-visibility ${
                data.showBlockTags === false ? "" : "is-active"
              }`}
              aria-pressed={data.showBlockTags !== false}
              onClick={() =>
                setData((current) => ({
                  ...current,
                  showBlockTags: current.showBlockTags === false,
                }))
              }
            >
              {data.showBlockTags === false ? (
                <EyeOff size={14} />
              ) : (
                <Eye size={14} />
              )}
            </IconButton>
            {data.tags.map((tagItem) => (
              <button
                type="button"
                key={tagItem.id}
                className={`tag-chip ${
                  tagEditing
                    ? tagPopoverId === tagItem.id
                      ? "is-editing"
                      : ""
                    : selectedTags.includes(tagItem.id)
                      ? "is-active"
                      : ""
                }`}
                aria-pressed={
                  tagEditing
                    ? tagPopoverId === tagItem.id
                    : selectedTags.includes(tagItem.id)
                }
                onClick={() => {
                  if (tagEditing) setTagPopoverId(tagItem.id);
                  else toggleTagFilter(tagItem.id);
                }}
              >
                <span
                  className="tag-dot"
                  style={{ backgroundColor: tagItem.color }}
                  aria-hidden="true"
                />
                {tagItem.name || "·"}
              </button>
            ))}
          </div>

          <div className="tag-edit-actions">
            {tagEditing ? (
              <>
                <IconButton label="태그 추가" onClick={createTag}>
                  <Plus size={14} />
                </IconButton>
                <IconButton label="태그 편집 취소" onClick={cancelTagEditing}>
                  <X size={14} />
                </IconButton>
                <IconButton label="태그 편집 완료" onClick={finishTagEditing}>
                  <Check size={15} />
                </IconButton>
              </>
            ) : (
              <IconButton label="태그 편집" onClick={startTagEditing}>
                <Pencil size={14} />
              </IconButton>
            )}
          </div>

          {tagEditing && editingTag && (
            <section className="tag-editor-popover" aria-label="태그 속성">
              <div className="tag-editor-topline">
                <span
                  className="tag-preview-dot"
                  style={{ backgroundColor: editingTag.color }}
                  aria-hidden="true"
                />
                <input
                  className="tag-name-input"
                  aria-label="태그 이름"
                  value={editingTag.name}
                  onChange={(event) =>
                    updateTag(editingTag.id, { name: event.target.value })
                  }
                />
                <IconButton
                  label={
                    editingTag.visible === false
                      ? "블록에 태그 표시"
                      : "블록에서 태그 숨기기"
                  }
                  className={editingTag.visible === false ? "" : "is-active"}
                  aria-pressed={editingTag.visible !== false}
                  onClick={() =>
                    updateTag(editingTag.id, {
                      visible: editingTag.visible === false,
                    })
                  }
                >
                  {editingTag.visible === false ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </IconButton>
                <IconButton
                  label="태그 삭제"
                  className="delete-button"
                  onClick={() => deleteTag(editingTag.id)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <div className="tag-palette" aria-label="태그 색상">
                {TAG_COLORS.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    className={`tag-color-button ${
                      editingTag.color === color ? "is-active" : ""
                    }`}
                    aria-label={`태그 색상 ${index + 1}`}
                    aria-pressed={editingTag.color === color}
                    onClick={() => updateTag(editingTag.id, { color })}
                  >
                    <span style={{ backgroundColor: color }} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </header>

      <div className="calendar-scroll">
        <section className={`calendar-grid view-${view.toLowerCase()}`} aria-label="달력">
          {dates.map((date) => renderDayColumn(date))}
        </section>
      </div>

      <button
        type="button"
        className={`sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        aria-label="보관함 닫기"
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={`inbox-sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="보관함"
        aria-hidden={!sidebarOpen}
      >
        <div className="sidebar-header">
          <Inbox size={18} aria-hidden="true" />
          <div className="sidebar-actions">
            <input
              ref={importRef}
              className="visually-hidden"
              type="file"
              accept="application/json"
              aria-label="JSON 불러오기"
              onChange={importData}
            />
            <IconButton label="JSON 불러오기" onClick={() => importRef.current?.click()}>
              <Upload size={16} />
            </IconButton>
            <IconButton label="JSON 내려받기" onClick={exportData}>
              <Download size={16} />
            </IconButton>
            <IconButton label="보관함 닫기" onClick={() => setSidebarOpen(false)}>
              <PanelRightClose size={17} />
            </IconButton>
          </div>
        </div>

        <div
          className="inbox-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleSectionDrop(event, null)}
        >
          {(Object.keys(BLOCK_META) as BlockType[]).map((type) => {
            const TypeIcon = BLOCK_META[type].icon;
            const filteredItems = visibleBlocks.filter(
              (block) => block.type === type && block.date === null,
            );
            const items =
              type === "todo" ? orderTodoBlocks(filteredItems) : filteredItems;
            const sectionRows: ReactNode[] = [];
            items.forEach((block) => {
              sectionRows.push(renderInsertGap(type, null, block));
              sectionRows.push(renderBlockItem(block, false, null));
            });
            sectionRows.push(renderInsertGap(type, null));
            return (
              <section className="inbox-section" key={type} aria-label={type}>
                <div className="section-rail">
                  <TypeIcon size={14} aria-hidden="true" />
                  <IconButton
                    label="블록 추가"
                    className="section-add"
                    onClick={() => createBlock(type, null)}
                  >
                    <Plus size={13} />
                  </IconButton>
                </div>
                <div className="section-blocks">
                  {sectionRows}
                </div>
              </section>
            );
          })}
        </div>
      </aside>

      {!loaded && <div className="loading-mark"><Circle size={7} /></div>}
    </main>
  );
}
