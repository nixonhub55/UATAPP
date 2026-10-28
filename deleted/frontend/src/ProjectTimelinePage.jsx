
import { useMemo, useRef, useState, useEffect } from "react";
import {
  RefreshCw,
  ZoomIn,
  ZoomOut,
  MapPinned,
  CalendarDays,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Circle,
  Move,
} from "lucide-react";
import "./ProjectTimelinePage.css";

const DAY_WIDTH = 40;
const LEFT_PADDING = 110;
const TOP_PADDING = 120;
const GROUP_GAP = 270;
const CARD_WIDTH = 230;




const STATUS_COLORS = {
  pass: "#22a06b",
  pending: "#eab308",
  failed: "#ef4444",
  blank: "#94a3b8",
};

function readField(item, names, fallback = "") {
  for (const name of names) {
    if (item?.[name] !== undefined && item?.[name] !== null) {
      return item[name];
    }
  }
  return fallback;
}

function getCaseProjectId(item) {
  return readField(item, ["project_id", "projectId"], item?.project?.id);
}

function getDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Database examples use M/D/YYYY, such as 11/16/2026.
  const usDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const [, month, day, year] = usDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Parse YYYY-MM-DD as a local date to avoid timezone shifts.
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatPinDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatFullDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCaseStatus(item) {
  const raw = readField(
    item,
    [
      "result_name",
      "result",
      "result_status",
      "overall_result",
      "status_name",
    ],
    ""
  );

  const value =
    typeof raw === "object"
      ? readField(raw, ["name", "label", "result_name"], "")
      : raw;

  const normalized = String(value).trim().toLowerCase();

  if (
    normalized.includes("not ok") ||
    normalized.includes("not_ok") ||
    normalized.includes("fail") ||
    normalized.includes("failed")
  ) {
    return "failed";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("for review") ||
    normalized.includes("ongoing")
  ) {
    return "pending";
  }

  if (normalized === "pass" || normalized === "passed") {
    return "pass";
  }

  // Empty, untested, or unknown statuses use the neutral road color.
  return "blank";
}

function getStatusLabel(item) {
  const raw = readField(
    item,
    ["result_name", "result", "result_status", "overall_result"],
    ""
  );

  const value =
    typeof raw === "object"
      ? readField(raw, ["name", "label", "result_name"], "")
      : raw;

  const normalized = String(value).trim().toLowerCase();

  if (normalized.includes("not ok") || normalized.includes("not_ok")) {
    return "Not OK";
  }
  if (normalized.includes("fail")) return "Failed";
  if (normalized === "pass" || normalized === "passed") return "Pass";
  if (normalized.includes("pending")) return "Pending";
  if (normalized.includes("review")) return "For Review";
  if (normalized.includes("ongoing")) return "Ongoing";
  return value ? String(value) : "No response";
}

function getCaseTitle(item) {
  const module = readField(item, ["module", "module_name"], "");
  const subModule = readField(item, ["sub_module", "subModule"], "");

  return [module, subModule].filter(Boolean).join(" / ") ||
    `Test case ${item.id ?? ""}`.trim();
}

function getCaseId(item, index) {
  return item.id ?? item.test_case_id ?? `case-${index}`;
}

function getGroupStatus(items) {
  // A group with any failed case is red. Otherwise Pending takes priority.
  if (items.some((item) => getCaseStatus(item) === "failed")) return "failed";
  if (items.some((item) => getCaseStatus(item) === "pending")) return "pending";
  if (items.length && items.every((item) => getCaseStatus(item) === "pass")) {
    return "pass";
  }
  return "blank";
}

function monthLabel(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function makeCurve(start, end, index) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const direction = index % 2 === 0 ? 1 : -1;
  const bend = Math.min(100, Math.max(36, dx * 0.2)) * direction;

  const c1x = start.x + dx * 0.35;
  const c2x = start.x + dx * 0.7;
  const c1y = start.y + bend;
  const c2y = end.y - bend;

  return `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
}

function RoadPin({ point, onSelect, selected }) {
  return (
    <g
      className={`pt-road-pin ${selected ? "is-selected" : ""}`}
      transform={`translate(${point.x}, ${point.y})`}
      onClick={() => onSelect(point)}
      role="button"
      tabIndex={0}
      aria-label={`${formatPinDate(point.date)}, ${point.cases.length} test cases`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(point);
        }
      }}
    >
      <circle className="pt-pin-halo" r="27" />
      <path
        className="pt-pin-shape"
        d="M 0 20 C -4 12 -17 1 -17 -9 A 17 17 0 1 1 17 -9 C 17 1 4 12 0 20 Z"
        fill={STATUS_COLORS[point.status]}
      />
      <circle className="pt-pin-inner" cy="-9" r="7" />
      <text className="pt-pin-date" y="-42" textAnchor="middle">
        {formatPinDate(point.date)}
      </text>
      <text className="pt-pin-count" y="38" textAnchor="middle">
        {point.cases.length} {point.cases.length === 1 ? "case" : "cases"}
      </text>
    </g>
  );
}

export default function ProjectTimelinePage({
  projects = [],
  cases = [],
  projectId: initialProjectId,
  onProjectChange,
}) {
  
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  const [localProjectId, setLocalProjectId] = useState(
    initialProjectId ?? ""
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPointKey, setSelectedPointKey] = useState(null);

  useEffect(() => {
    if (
      initialProjectId !== undefined &&
      initialProjectId !== null &&
      String(initialProjectId) !== String(localProjectId)
    ) {
      setLocalProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  const selectedProjectId =
    localProjectId !== "" ? localProjectId : initialProjectId ?? "";

  const projectCases = useMemo(() => {
    if (selectedProjectId === "" || selectedProjectId === null) return [];

    return (Array.isArray(cases) ? cases : []).filter(
      (item) =>
        String(getCaseProjectId(item)) === String(selectedProjectId)
    );
  }, [cases, selectedProjectId]);

  const { groupedCases, undatedCases } = useMemo(() => {
    const groups = new Map();
    const undated = [];

    projectCases.forEach((item, index) => {
      const startDate = getDate(
        readField(item, ["target_from", "targetFrom", "start_date"], null)
      );

      const endDate = getDate(
        readField(item, ["target_to", "targetTo", "end_date"], null)
      );

      if (!startDate) {
        undated.push({ item, index });
        return;
      }

      const key = dateKey(startDate);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: startDate,
          cases: [],
          earliestEnd: endDate,
          latestEnd: endDate,
        });
      }

      const group = groups.get(key);
      group.cases.push(item);

      if (endDate) {
        if (!group.earliestEnd || endDate < group.earliestEnd) {
          group.earliestEnd = endDate;
        }
        if (!group.latestEnd || endDate > group.latestEnd) {
          group.latestEnd = endDate;
        }
      }
    });

    return {
      groupedCases: Array.from(groups.values()).sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      ),
      undatedCases: undated,
    };
  }, [projectCases]);

  const timeline = useMemo(() => {
    if (!groupedCases.length) {
      return {
        points: [],
        paths: [],
        months: [],
        width: 1200,
        height: 520,
      };
    }

    const firstDate = groupedCases[0].date;
    const lastDate = groupedCases[groupedCases.length - 1].date;
    const totalDays = Math.max(
      1,
      Math.round((lastDate - firstDate) / 86400000)
    );

    const width = Math.max(
      1200,
      LEFT_PADDING * 2 + totalDays * DAY_WIDTH + 300
    );

    const points = groupedCases.map((group, index) => {
      const days = Math.round((group.date - firstDate) / 86400000);

      // Alternate the route height to create a winding map-road effect.
      const y = TOP_PADDING + (index % 2 === 0 ? 70 : 170);

      return {
        ...group,
        x: LEFT_PADDING + days * DAY_WIDTH,
        y,
        status: getGroupStatus(group.cases),
      };
    });

    const paths = points.slice(0, -1).map((point, index) => {
      const next = points[index + 1];

      // A segment is colored according to the cases starting at its pin.
      return {
        key: `${point.key}-${next.key}`,
        d: makeCurve(point, next, index),
        status: point.status,
      };
    });

    const months = [];
    const seenMonths = new Set();

    points.forEach((point) => {
      const key = `${point.date.getFullYear()}-${point.date.getMonth()}`;
      if (!seenMonths.has(key)) {
        seenMonths.add(key);
        months.push({
          key,
          x: point.x,
          label: monthLabel(point.date),
        });
      }
    });

    const height = Math.max(
      540,
      ...points.map((point) => point.y + 210)
    );

    return { points, paths, months, width, height };
  }, [groupedCases]);

  const selectedPoint = timeline.points.find(
    (point) => point.key === selectedPointKey
  );

  const counts = useMemo(() => {
    return projectCases.reduce(
      (result, item) => {
        result.total += 1;
        result[getCaseStatus(item)] += 1;
        return result;
      },
      { total: 0, pass: 0, pending: 0, failed: 0, blank: 0 }
    );
  }, [projectCases]);

  function changeProject(value) {
    setLocalProjectId(value);
    setSelectedPointKey(null);
    setPan({ x: 24, y: 16 });
    setZoom(1);
    onProjectChange?.(value);
  }

  function resetView() {
    setPan({ x: 24, y: 16 });
    setZoom(1);
  }

  function startDrag(event) {
    // Allow clicks on date pins and controls without dragging the map.
    if (event.target.closest?.(".pt-road-pin, button, select, a")) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragRef.current) return;

    const drag = dragRef.current;
    setPan({
      x: drag.panX + (event.clientX - drag.startX),
      y: drag.panY + (event.clientY - drag.startY),
    });
  }

  function stopDrag(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    setZoom((current) =>
      Math.min(1.8, Math.max(0.45, current + (event.deltaY < 0 ? 0.08 : -0.08)))
    );
  }

  return (
    <div className="pt-page">
      <header className="pt-header">
        <div className="pt-heading">
          <div className="pt-heading-icon">
            <MapPinned size={23} />
          </div>
          <div>
            <h1>Project Timeline</h1>
            <p>Follow your test cases along the project road map.</p>
          </div>
        </div>

        <div className="pt-project-picker">
          <label htmlFor="pt-project-select">Project</label>
          <select
            id="pt-project-select"
            value={selectedProjectId}
            onChange={(event) => changeProject(event.target.value)}
          >
            <option value="">Select a project</option>
            {projects.map((project) => {
              const id = project.id ?? project.project_id;
              return (
                <option key={id} value={id}>
                  {project.name ?? project.project_name ?? `Project ${id}`}
                </option>
              );
            })}
          </select>
        </div>
      </header>

      <section className="pt-summary">
        <div className="pt-summary-card">
          <span className="pt-summary-icon total"><CalendarDays size={19} /></span>
          <div><small>Total test cases</small><strong>{counts.total}</strong></div>
        </div>
        <div className="pt-summary-card">
          <span className="pt-summary-icon pass"><CheckCircle2 size={19} /></span>
          <div><small>Pass</small><strong>{counts.pass}</strong></div>
        </div>
        <div className="pt-summary-card">
          <span className="pt-summary-icon pending"><Clock3 size={19} /></span>
          <div><small>Pending</small><strong>{counts.pending}</strong></div>
        </div>
        <div className="pt-summary-card">
          <span className="pt-summary-icon failed"><AlertTriangle size={19} /></span>
          <div><small>Not OK / Failed</small><strong>{counts.failed}</strong></div>
        </div>
        <div className="pt-summary-card">
          <span className="pt-summary-icon blank"><Circle size={19} /></span>
          <div><small>No response</small><strong>{counts.blank}</strong></div>
        </div>
      </section>

      <section className="pt-map-panel">
        <div className="pt-map-toolbar">
          <div className="pt-map-title">
            <strong>Road map</strong>
            <span>Drag to move · Ctrl + scroll to zoom</span>
          </div>

          <div className="pt-map-actions">
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))}
            >
              <ZoomOut size={18} />
            </button>
            <span className="pt-zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}
            >
              <ZoomIn size={18} />
            </button>
            <button type="button" title="Reset map view" onClick={resetView}>
              <RefreshCw size={17} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div
          className={`pt-map-viewport ${isDragging ? "is-dragging" : ""}`}
          ref={viewportRef}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onWheel={handleWheel}
        >
          {selectedProjectId === "" ? (
            <div className="pt-empty">
              <MapPinned size={40} />
              <h3>Select a project</h3>
              <p>Choose a project above to view its test-case timeline.</p>
            </div>
          ) : projectCases.length === 0 ? (
            <div className="pt-empty">
              <CalendarDays size={40} />
              <h3>No test cases found</h3>
              <p>
                No test cases were received for this project. Check that the
                parent page passes the cases array and that each case has the
                correct project_id.
              </p>
            </div>
          ) : groupedCases.length === 0 ? (
            <div className="pt-empty">
              <CalendarDays size={40} />
              <h3>No target start dates</h3>
              <p>Your test cases are shown in the undated section below.</p>
            </div>
          ) : (
            <div
              className="pt-map-world"
              style={{
                width: timeline.width,
                height: timeline.height,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg
                className="pt-road-svg"
                width={timeline.width}
                height={timeline.height}
                viewBox={`0 0 ${timeline.width} ${timeline.height}`}
                aria-label="Curved test-case timeline road"
              >
                <defs>
                  <pattern
                    id="pt-map-grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="#dce7e3"
                      strokeWidth="1"
                    />
                  </pattern>
                  <filter id="pt-road-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity="0.17" />
                  </filter>
                </defs>

                <rect
                  width={timeline.width}
                  height={timeline.height}
                  fill="url(#pt-map-grid)"
                />

                {timeline.months.map((month) => (
                  <g key={month.key} className="pt-month-marker">
                    <line
                      x1={month.x}
                      y1="35"
                      x2={month.x}
                      y2={timeline.height - 20}
                    />
                    <text x={month.x} y="28">{month.label}</text>
                  </g>
                ))}

                {timeline.paths.map((path) => (
                  <g key={path.key} filter="url(#pt-road-shadow)">
                    <path className="pt-road-outer" d={path.d} />
                    <path className="pt-road-shoulder" d={path.d} />
                    <path className="pt-road-asphalt" d={path.d} />
                    <path
                      className={`pt-road-status pt-road-status-${path.status}`}
                      d={path.d}
                    />
                    <path className="pt-road-centerline" d={path.d} />
                  </g>
                ))}

                {timeline.points.length === 1 && (
                  <g>
                    <path
                      className="pt-road-outer"
                      d={`M ${timeline.points[0].x - 70} ${timeline.points[0].y} L ${timeline.points[0].x + 70} ${timeline.points[0].y}`}
                    />
                    <path
                      className="pt-road-asphalt"
                      d={`M ${timeline.points[0].x - 70} ${timeline.points[0].y} L ${timeline.points[0].x + 70} ${timeline.points[0].y}`}
                    />
                    <path
                      className="pt-road-centerline"
                      d={`M ${timeline.points[0].x - 70} ${timeline.points[0].y} L ${timeline.points[0].x + 70} ${timeline.points[0].y}`}
                    />
                  </g>
                )}

                {timeline.points.map((point) => (
                  <RoadPin
                    key={point.key}
                    point={point}
                    selected={point.key === selectedPointKey}
                    onSelect={(selected) => {
                      setSelectedPointKey(selected.key);
                    }}
                  />
                ))}
              </svg>

              {timeline.points.map((point) => (
                <article
                  key={`card-${point.key}`}
                  className={`pt-date-card ${
                    point.key === selectedPointKey ? "is-selected" : ""
                  }`}
                  style={{
                    left: point.x - CARD_WIDTH / 2,
                    top: point.y + 62,
                    width: CARD_WIDTH,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="pt-date-card-heading"
                    onClick={() =>
                      setSelectedPointKey((current) =>
                        current === point.key ? null : point.key
                      )
                    }
                  >
                    <span className="pt-date-dot" style={{ background: STATUS_COLORS[point.status] }} />
                    <span>
                      <strong>{formatFullDate(point.date)}</strong>
                      <small>{point.cases.length} test case(s)</small>
                    </span>
                  </button>

                  <div className="pt-date-card-list">
                    {point.cases.map((item, index) => {
                      const status = getCaseStatus(item);
                      const targetTo = getDate(
                        readField(item, ["target_to", "targetTo", "end_date"], null)
                      );

                      return (
                        <div
                          className="pt-case-item"
                          key={getCaseId(item, index)}
                        >
                          <div className="pt-case-item-top">
                            <strong>{getCaseTitle(item)}</strong>
                            <span className={`pt-status-pill pt-status-${status}`}>
                              {getStatusLabel(item)}
                            </span>
                          </div>
                          <small>
                            ID: {getCaseId(item, index)}
                            {targetTo ? ` · Until ${formatPinDate(targetTo)}` : ""}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="pt-map-legend">
          <span><i className="pt-legend-road pass" /> Pass</span>
          <span><i className="pt-legend-road pending" /> Pending / For Review</span>
          <span><i className="pt-legend-road failed" /> Not OK / Failed</span>
          <span><i className="pt-legend-road blank" /> No response</span>
          <span className="pt-legend-help"><Move size={15} /> Click and drag the map to move it</span>
        </div>
      </section>

      {selectedPoint && (
        <div className="pt-selection-note">
          <strong>Selected date:</strong> {formatFullDate(selectedPoint.date)} —{" "}
          {selectedPoint.cases.length} test case(s).
          <button type="button" onClick={() => setSelectedPointKey(null)}>
            Clear selection
          </button>
        </div>
      )}

      <section className="pt-undated-section">
        <div className="pt-undated-heading">
          <div>
            <h2>Undated test cases</h2>
            <p>Test cases without a valid target_from date remain visible here.</p>
          </div>
          <span className="pt-undated-count">{undatedCases.length}</span>
        </div>

        {undatedCases.length === 0 ? (
          <div className="pt-undated-empty">All test cases have a target start date.</div>
        ) : (
          <div className="pt-undated-grid">
            {undatedCases.map(({ item, index }) => {
              const status = getCaseStatus(item);
              const targetTo = getDate(
                readField(item, ["target_to", "targetTo", "end_date"], null)
              );

              return (
                <article
                  className="pt-undated-card"
                  key={getCaseId(item, index)}
                >
                  <div className="pt-undated-card-top">
                    <strong>{getCaseTitle(item)}</strong>
                    <span className={`pt-status-pill pt-status-${status}`}>
                      {getStatusLabel(item)}
                    </span>
                  </div>
                  <p>
                    Test case ID: {getCaseId(item, index)}
                  </p>
                  <small>
                    Target start: Not set
                    {targetTo ? ` · Target end: ${formatFullDate(targetTo)}` : ""}
                  </small>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
