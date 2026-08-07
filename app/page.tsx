"use client";

import {
  Archive,
  CalendarDays,
  CalendarRange,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  GripVertical,
  Inbox,
  Link2,
  PanelRightClose,
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

const EMPTY_DATA: AppData = { version: 1, tags: [], blocks: [] };
const STORAGE_KEY = "yeecheck.data.v1";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppData;
          if (active) setData(parsed);
        } else {
          const response = await fetch("/data.json");
          const parsed = (await response.json()) as AppData;
          if (active) setData(parsed);
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

  const dates = useMemo(() => rangeForView(anchor, view), [anchor, view]);
  const todayKey = toDateKey(new Date());
  const editingBlock = data.blocks.find((block) => block.id === editingId);

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
    return visibleBlocks.filter((block) => {
      if (block.type !== type || !block.date) return false;
      if (type === "event" && block.endDate) {
        return date >= block.date && date <= block.endDate;
      }
      return block.date === date;
    });
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
          setData(parsed);
        }
      } catch {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function BlockItem({ block, compact = false }: { block: CalendarBlock; compact?: boolean }) {
    const TypeIcon = BLOCK_META[block.type].icon;
    const blockTags = data.tags.filter((tagItem) =>
      block.tags.includes(tagItem.id),
    );
    const isChild = block.type === "todo" && Boolean(block.parentId);

    return (
      <article
        className={`block-item ${block.completed ? "is-complete" : ""} ${isChild ? "is-child" : ""}`}
        draggable
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
        {block.type === "todo" ? (
          <IconButton
            label={block.completed ? "완료 취소" : "완료"}
            className="block-check"
            onClick={() => updateBlock(block.id, { completed: !block.completed })}
          >
            {block.completed ? <CheckSquare2 size={15} /> : <Square size={15} />}
          </IconButton>
        ) : (
          <TypeIcon className="type-icon" size={14} aria-hidden="true" />
        )}

        <div className="block-main">
          {!compact && block.type === "time" && (
            <div className="block-meta time-meta">
              <span>{block.startTime}</span>
              <span>—</span>
              <span>{block.endTime}</span>
            </div>
          )}
          {!compact && block.type === "event" && block.endDate !== block.date && (
            <div className="block-meta">
              <span>{block.date?.slice(5)}</span>
              <span>—</span>
              <span>{block.endDate?.slice(5)}</span>
            </div>
          )}
          <input
            className="block-title"
            data-block-title={block.id}
            aria-label="블록 내용"
            value={block.title}
            onChange={(event) => updateBlock(block.id, { title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          {!compact && (
            <div className="block-footer">
              {block.type === "todo" && block.repeat !== "none" && (
                <Repeat2 size={11} aria-hidden="true" />
              )}
              {block.type === "todo" && block.parentId && (
                <Link2 size={11} aria-hidden="true" />
              )}
              {blockTags.map((tagItem) => (
                <span
                  className="mini-tag"
                  key={tagItem.id}
                  style={{ "--tag-color": tagItem.color } as React.CSSProperties}
                >
                  {tagItem.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <IconButton
          label="블록 속성"
          className="block-settings"
          onClick={() => setEditingId(block.id)}
        >
          <Settings2 size={13} />
        </IconButton>
      </article>
    );
  }

  function Section({
    type,
    date,
    compact = false,
  }: {
    type: BlockType;
    date: string;
    compact?: boolean;
  }) {
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
          <span className="section-line" />
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
            <BlockItem key={block.id} block={block} compact={compact} />
          ))}
          {items.length === 0 && <div className="empty-drop" aria-hidden="true" />}
        </div>
      </section>
    );
  }

  function DayColumn({ date }: { date: Date }) {
    const dateKey = toDateKey(date);
    const isOutsideMonth = view === "M" && date.getMonth() !== anchor.getMonth();
    const compact = view === "M";

    return (
      <article
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
          {!compact && <span className="date-full">{dateKey}</span>}
        </button>
        <div className="day-content">
          <Section type="event" date={dateKey} compact={compact} />
          <Section type="todo" date={dateKey} compact={compact} />
          <Section type="time" date={dateKey} compact={compact} />
          <Section type="memo" date={dateKey} compact={compact} />
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

        <div className="tag-strip" aria-label="태그 필터">
          <IconButton
            label="태그 필터 해제"
            className={selectedTags.length === 0 ? "tag-all is-active" : "tag-all"}
            onClick={() => setSelectedTags([])}
          >
            <Tag size={14} />
          </IconButton>
          {data.tags.map((tagItem) => (
            <button
              type="button"
              key={tagItem.id}
              className={`tag-chip ${selectedTags.includes(tagItem.id) ? "is-active" : ""}`}
              aria-pressed={selectedTags.includes(tagItem.id)}
              onClick={() => toggleTagFilter(tagItem.id)}
            >
              <span
                className="tag-dot"
                style={{ backgroundColor: tagItem.color }}
                aria-hidden="true"
              />
              {tagItem.name}
            </button>
          ))}
        </div>
      </header>

      <div className="calendar-scroll">
        <section className={`calendar-grid view-${view.toLowerCase()}`} aria-label="달력">
          {dates.map((date) => (
            <DayColumn key={toDateKey(date)} date={date} />
          ))}
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
                  <span className="section-line" />
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
                    <BlockItem key={block.id} block={block} />
                  ))}
                  {items.length === 0 && <div className="empty-drop" aria-hidden="true" />}
                </div>
              </section>
            );
          })}
        </div>
      </aside>

      {editingBlock && (
        <div className="editor-backdrop">
          <button
            type="button"
            className="editor-click-away"
            aria-label="블록 속성 닫기"
            onClick={() => setEditingId(null)}
          />
          <section
            className="block-editor"
            role="dialog"
            aria-modal="true"
            aria-label="블록 속성"
          >
            <div className="editor-header">
              {(() => {
                const TypeIcon = BLOCK_META[editingBlock.type].icon;
                return <TypeIcon size={18} aria-hidden="true" />;
              })()}
              <IconButton label="닫기" onClick={() => setEditingId(null)}>
                <X size={17} />
              </IconButton>
            </div>

            <input
              className="editor-title"
              aria-label="블록 내용"
              value={editingBlock.title}
              onChange={(event) =>
                updateBlock(editingBlock.id, { title: event.target.value })
              }
            />

            <div className="editor-field">
              <CalendarDays size={16} aria-hidden="true" />
              <input
                type="date"
                aria-label="날짜"
                value={editingBlock.date ?? ""}
                onChange={(event) => {
                  const nextDate = event.target.value || null;
                  const duration =
                    editingBlock.type === "event" &&
                    editingBlock.date &&
                    editingBlock.endDate
                      ? diffDays(editingBlock.date, editingBlock.endDate)
                      : 0;
                  updateBlock(editingBlock.id, {
                    date: nextDate,
                    ...(editingBlock.type === "event"
                      ? {
                          endDate: nextDate
                            ? toDateKey(addDays(fromDateKey(nextDate), duration))
                            : null,
                        }
                      : {}),
                  });
                }}
              />
              {editingBlock.type === "event" && (
                <>
                  <span>—</span>
                  <input
                    type="date"
                    aria-label="끝 날짜"
                    min={editingBlock.date ?? undefined}
                    value={editingBlock.endDate ?? ""}
                    onChange={(event) =>
                      updateBlock(editingBlock.id, {
                        endDate: event.target.value || editingBlock.date,
                      })
                    }
                  />
                </>
              )}
            </div>

            {editingBlock.type === "time" && (
              <div className="editor-field">
                <Clock3 size={16} aria-hidden="true" />
                <input
                  type="time"
                  aria-label="시작 시간"
                  value={editingBlock.startTime ?? ""}
                  onChange={(event) =>
                    updateBlock(editingBlock.id, { startTime: event.target.value })
                  }
                />
                <span>—</span>
                <input
                  type="time"
                  aria-label="끝 시간"
                  value={editingBlock.endTime ?? ""}
                  onChange={(event) =>
                    updateBlock(editingBlock.id, { endTime: event.target.value })
                  }
                />
              </div>
            )}

            {editingBlock.type === "todo" && (
              <>
                <div className="editor-field">
                  <Repeat2 size={16} aria-hidden="true" />
                  <select
                    aria-label="반복"
                    value={editingBlock.repeat ?? "none"}
                    onChange={(event) =>
                      updateBlock(editingBlock.id, {
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
                <div className="editor-field">
                  <Link2 size={16} aria-hidden="true" />
                  <select
                    aria-label="부모 할일"
                    value={editingBlock.parentId ?? ""}
                    onChange={(event) =>
                      updateBlock(editingBlock.id, {
                        parentId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">—</option>
                    {data.blocks
                      .filter(
                        (block) =>
                          block.type === "todo" && block.id !== editingBlock.id,
                      )
                      .map((block) => (
                        <option key={block.id} value={block.id}>
                          {block.title || "·"}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}

            <div className="editor-tags" aria-label="태그">
              <Tag size={16} aria-hidden="true" />
              <div className="editor-tag-list">
                {data.tags.map((tagItem) => {
                  const selected = editingBlock.tags.includes(tagItem.id);
                  return (
                    <button
                      type="button"
                      key={tagItem.id}
                      className={`tag-chip ${selected ? "is-active" : ""}`}
                      aria-pressed={selected}
                      onClick={() =>
                        updateBlock(editingBlock.id, {
                          tags: selected
                            ? editingBlock.tags.filter((id) => id !== tagItem.id)
                            : [...editingBlock.tags, tagItem.id],
                        })
                      }
                    >
                      <span
                        className="tag-dot"
                        style={{ backgroundColor: tagItem.color }}
                        aria-hidden="true"
                      />
                      {tagItem.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="editor-footer">
              {editingBlock.type === "todo" && (
                <IconButton
                  label={editingBlock.completed ? "완료 취소" : "완료"}
                  className={editingBlock.completed ? "is-active" : ""}
                  onClick={() =>
                    updateBlock(editingBlock.id, {
                      completed: !editingBlock.completed,
                    })
                  }
                >
                  {editingBlock.completed ? (
                    <CheckSquare2 size={17} />
                  ) : (
                    <Square size={17} />
                  )}
                </IconButton>
              )}
              <IconButton label="삭제" className="delete-button" onClick={() => deleteBlock(editingBlock.id)}>
                <Trash2 size={17} />
              </IconButton>
            </div>
          </section>
        </div>
      )}

      {!loaded && <div className="loading-mark"><Circle size={7} /></div>}
    </main>
  );
}
