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

type AppData = {
  version: number;
  tags: AppTag[];
  blocks: CalendarBlock[];
};

const EMPTY_DATA: AppData = { version: 2, tags: [], blocks: [] };
const STORAGE_KEY = "yeecheck.data.v1";

const TAG_COLORS = [
  "#1f1f1f",
  "#353535",
  "#4b4b4b",
  "#626262",
  "#777777",
  "#8d8d8d",
  "#a3a3a3",
  "#b8b8b8",
  "#cecece",
  "#e3e3e3",
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

function normalizeData(value: AppData): AppData {
  return {
    ...value,
    version: 2,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const tagEditSnapshotRef = useRef<AppData | null>(null);
  const tagFilterSnapshotRef = useRef<string[]>([]);

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
    if (!editingId) return;

    function closePopover(event: MouseEvent) {
      const target = event.target as Element | null;
      const blockRoot = target?.closest("[data-block-id]");
      if (blockRoot?.getAttribute("data-block-id") !== editingId) {
        setEditingId(null);
      }
    }

    document.addEventListener("mousedown", closePopover);
    return () => document.removeEventListener("mousedown", closePopover);
  }, [editingId]);

  const dates = useMemo(() => rangeForView(anchor, view), [anchor, view]);
  const todayKey = toDateKey(new Date());
  const editingTag = data.tags.find((tagItem) => tagItem.id === tagPopoverId);

  const visibleBlocks = useMemo(() => {
    if (selectedTags.length === 0) return data.blocks;
    return data.blocks.filter((block) =>
      selectedTags.every((tagId) => block.tags.includes(tagId)),
    );
  }, [data.blocks, selectedTags]);

  function updateBlock(id: string, patch: Partial<CalendarBlock>) {
    setData((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  }

  function createBlock(type: BlockType, date: string | null) {
    const id = uid();
    const block: CalendarBlock = {
      id,
      type,
      title: "",
      date,
      tags: [],
      ...(type === "event" ? { endDate: date } : {}),
      ...(type === "todo"
        ? { completed: false, repeat: "none" as Repeat, parentId: null }
        : {}),
      ...(type === "time" ? { startTime: "09:00", endTime: "10:00" } : {}),
    };

    setData((current) => ({ ...current, blocks: [...current.blocks, block] }));
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-block-title="${id}"]`,
      );
      input?.focus();
    }, 30);
  }

  function deleteBlock(id: string) {
    setData((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== id),
    }));
    setEditingId(null);
  }

  function moveBlock(
    id: string,
    date: string | null,
    type?: BlockType,
    beforeId?: string,
  ) {
    setData((current) => {
      const moving = current.blocks.find((block) => block.id === id);
      if (!moving || (type && moving.type !== type)) return current;

      const duration =
        moving.type === "event" && moving.date && moving.endDate
          ? diffDays(moving.date, moving.endDate)
          : 0;
      const moved: CalendarBlock = {
        ...moving,
        date,
        ...(moving.type === "event"
          ? { endDate: date ? toDateKey(addDays(fromDateKey(date), duration)) : null }
          : {}),
      };
      const remaining = current.blocks.filter((block) => block.id !== id);
      const beforeIndex = beforeId
        ? remaining.findIndex((block) => block.id === beforeId)
        : -1;
      if (beforeIndex >= 0) remaining.splice(beforeIndex, 0, moved);
      else remaining.push(moved);
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
    if (id) moveBlock(id, date, type, beforeId);
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

    return type === "time"
      ? items.sort((a, b) =>
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
        )
      : items;
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
          <IconButton label="닫기" onClick={() => setEditingId(null)}>
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

        {block.type === "time" && (
          <div className="popover-field">
            <Clock3 size={14} aria-hidden="true" />
            <div className="popover-date-range">
              <input
                type="time"
                aria-label="시작 시간"
                value={block.startTime ?? ""}
                onChange={(event) =>
                  updateBlock(block.id, { startTime: event.target.value })
                }
              />
              <input
                type="time"
                aria-label="끝 시간"
                value={block.endTime ?? ""}
                onChange={(event) =>
                  updateBlock(block.id, { endTime: event.target.value })
                }
              />
            </div>
          </div>
        )}

        {block.type === "todo" && (
          <>
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
                <option value="daily">D</option>
                <option value="weekly">W</option>
                <option value="monthly">M</option>
              </select>
            </div>
            <div className="popover-field">
              <Link2 size={14} aria-hidden="true" />
              <select
                aria-label="부모 할일"
                value={block.parentId ?? ""}
                onChange={(event) =>
                  updateBlock(block.id, {
                    parentId: event.target.value || null,
                  })
                }
              >
                <option value="">—</option>
                {data.blocks
                  .filter(
                    (candidate) =>
                      candidate.type === "todo" && candidate.id !== block.id,
                  )
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title || "·"}
                    </option>
                  ))}
              </select>
            </div>
          </>
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

        <div className="popover-footer">
          {block.type === "todo" && (
            <IconButton
              label={block.completed ? "완료 취소" : "완료"}
              className={block.completed ? "is-active" : ""}
              onClick={() =>
                updateBlock(block.id, { completed: !block.completed })
              }
            >
              {block.completed ? (
                <CheckSquare2 size={15} />
              ) : (
                <Square size={15} />
              )}
            </IconButton>
          )}
          <IconButton
            label="삭제"
            className="delete-button"
            onClick={() => deleteBlock(block.id)}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </section>
    );
  }

  function renderBlockItem(block: CalendarBlock, compact = false) {
    const blockTags = data.tags.filter(
      (tagItem) => block.tags.includes(tagItem.id) && tagItem.visible !== false,
    );
    const isChild = block.type === "todo" && Boolean(block.parentId);
    const isTime = block.type === "time";

    return (
      <article
        key={block.id}
        className={`block-item ${block.completed ? "is-complete" : ""} ${isChild ? "is-child" : ""} ${isTime ? "is-time" : ""}`}
        draggable={editingId !== block.id}
        data-block-id={block.id}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", block.id);
          setDraggedId(block.id);
        }}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.stopPropagation();
          handleSectionDrop(event, block.date, block.type, block.id);
        }}
      >
        <GripVertical className="drag-handle" size={13} aria-hidden="true" />
        {block.type === "todo" && (
          <IconButton
            label={block.completed ? "완료 취소" : "완료"}
            className="block-check"
            onClick={() => updateBlock(block.id, { completed: !block.completed })}
          >
            {block.completed ? <CheckSquare2 size={15} /> : <Square size={15} />}
          </IconButton>
        )}

        {isTime && (
          <div className="time-cell" aria-label={`${block.startTime}부터 ${block.endTime}`}>
            <span>{block.startTime}</span>
            {!compact && <span>{block.endTime}</span>}
          </div>
        )}

        <div className="block-main">
          <div className="block-title-row">
            <input
              className="block-title"
              data-block-title={block.id}
              aria-label="블록 내용"
              value={block.title}
              onChange={(event) =>
                updateBlock(block.id, { title: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
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
          className={`block-settings ${editingId === block.id ? "is-active" : ""}`}
          onClick={() =>
            setEditingId((current) => (current === block.id ? null : block.id))
          }
        >
          <Settings2 size={13} />
        </IconButton>

        {editingId === block.id && renderBlockPopover(block)}
      </article>
    );
  }

  function renderSection(type: BlockType, date: string, compact = false) {
    const items = blocksFor(date, type);
    const TypeIcon = BLOCK_META[type].icon;

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
          {items.map((block) => (
            renderBlockItem(block, compact)
          ))}
          {items.length === 0 && <div className="empty-drop" aria-hidden="true" />}
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
      <aside className={`inbox-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="보관함">
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
            const items = visibleBlocks.filter(
              (block) => block.type === type && block.date === null,
            );
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
                  {items.map((block) => (
                    renderBlockItem(block)
                  ))}
                  {items.length === 0 && <div className="empty-drop" aria-hidden="true" />}
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
