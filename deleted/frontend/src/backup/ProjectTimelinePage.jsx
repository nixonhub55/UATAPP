
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ZoomIn, ZoomOut, MapPinned } from 'lucide-react';
import './ProjectTimelinePage.css';

const STATUS_COLORS = {
  Pass: '#15976a',
  Fail: '#e34c4c',
  'For Review': '#e99124',
  Pending: '#8493a7',
  'In Progress': '#2878d0',
  'Not Tested': '#8493a7'
};

function getResult(item) {
  return item.result_name || item.result || item.result_status || 'Pending';
}

function getDate(value) {
  if (!value) return null;

  const normalized = String(value).slice(0, 10);
  const date = new Date(`${normalized}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withYear = false) {
  const date = getDate(value);
  if (!date) return 'Not set';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {})
  });
}

function getStatusColor(result) {
  return STATUS_COLORS[result] || STATUS_COLORS.Pending;
}

export default function ProjectTimelinePage({
  projects = [],
  cases = []
}) {
  const [projectId, setProjectId] = useState('');
  const [mapView, setMapView] = useState({
    x: 0,
    y: 0,
    zoom: 1
  });

  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!projects.length) {
      setProjectId('');
      return;
    }

    if (!projects.some(p => String(p.id) === String(projectId))) {
      setProjectId(String(projects[0].id));
    }
  }, [projects, projectId]);

  const project = projects.find(
    p => String(p.id) === String(projectId)
  );

  const projectCases = useMemo(() => {
    return cases
      .filter(item =>
        String(item.project_id) === String(projectId) &&
        (item.target_from || item.target_to)
      )
      .sort((a, b) => {
        const dateA = getDate(a.target_from || a.target_to)?.getTime() || 0;
        const dateB = getDate(b.target_from || b.target_to)?.getTime() || 0;

        return dateA - dateB;
      });
  }, [cases, projectId]);

  const total = projectCases.length;
  const passed = projectCases.filter(
    item => getResult(item) === 'Pass'
  ).length;
  const failed = projectCases.filter(
    item => getResult(item) === 'Fail'
  ).length;
  const review = projectCases.filter(
    item => getResult(item) === 'For Review'
  ).length;
  const pending = projectCases.filter(item => {
    const result = getResult(item);
    return result === 'Pending' || result === 'Not Tested';
  }).length;

  const progress = total ? Math.round((passed / total) * 100) : 0;

  // Give every milestone enough horizontal space.
  const mapWidth = Math.max(1500, 300 + (total - 1) * 280);
  const mapHeight = 850;

  const points = useMemo(() => {
    const width = Math.max(1500, 300 + (projectCases.length - 1) * 280);
    
    return projectCases.map((item, index) => {
      const count = projectCases.length;
      const x = count === 1
        ? width / 2
        : 150 + index * ((width - 300) / (count - 1));

      const y = 420 + Math.sin(index * 1.15) * 125;
      const result = getResult(item);

      return {
        item,
        index,
        x,
        y,
        above: index % 2 === 0,
        color: getStatusColor(result)
      };
    });
  }, [projectCases]);

  const roadPath = points.length > 1
    ? points.map((point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        }

        const previous = points[index - 1];
        const middleX = (previous.x + point.x) / 2;

        return `C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`;
      }).join(' ')
    : 'M 100 420 C 300 250, 450 600, 700 420 S 1100 250, 1400 420';

  const firstDate = projectCases.reduce((earliest, item) => {
    const value = item.target_from || item.target_to;
    if (!value) return earliest;

    return !earliest || value < earliest ? value : earliest;
  }, '');

  const lastDate = projectCases.reduce((latest, item) => {
    const value = item.target_to || item.target_from;
    if (!value) return latest;

    return !latest || value > latest ? value : latest;
  }, '');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deadline = getDate(lastDate);
  const allPassed = total > 0 && passed === total;
  const delayed = Boolean(
    total > 0 && deadline && today > deadline && !allPassed
  );

  const scheduleStatus = !total
    ? 'Awaiting dated test cases'
    : allPassed
      ? 'Completed'
      : delayed
        ? 'Behind schedule'
        : 'In progress';

  function handlePointerDown(e) {
    if (e.button !== 0) return;

    e.preventDefault();
    movedRef.current = false;

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: mapView.x,
      originY: mapView.y
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  
function handlePointerMove(e) {
  const drag = dragRef.current;

  if (!drag || drag.pointerId !== e.pointerId) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    movedRef.current = true;
  }

  // Capture the values before scheduling the state update.
  const newX = drag.originX + dx;
  const newY = drag.originY + dy;

  setMapView(view => ({
    ...view,
    x: newX,
    y: newY
  }));
}


  function handlePointerUp() {
    dragRef.current = null;
  }

  function changeZoom(amount) {
    setMapView(view => ({
      ...view,
      zoom: Math.max(0.5, Math.min(2, view.zoom + amount))
    }));
  }

  function handleWheel(e) {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bounds.left;
    const mouseY = e.clientY - bounds.top;

    setMapView(view => {
      const newZoom = Math.max(
        0.5,
        Math.min(2, view.zoom - e.deltaY * 0.001)
      );

      const ratio = newZoom / view.zoom;

      return {
        zoom: newZoom,
        x: mouseX - (mouseX - view.x) * ratio,
        y: mouseY - (mouseY - view.y) * ratio
      };
    });
  }

  function resetMap() {
    setMapView({ x: 0, y: 0, zoom: 1 });
  }

  function selectProject(e) {
    setProjectId(e.target.value);
    resetMap();
  }

  return (
    <div className="pt-page">
      <div className="pt-heading">
        <div>
          <div className="pt-eyebrow">PROJECT MONITORING</div>
          <h2>Project Timeline</h2>
          <p>Explore your testing schedule along the project road.</p>
        </div>

        <div className={`pt-schedule ${delayed ? 'delayed' : ''}`}>
          <span className="pt-schedule-dot" />
          {scheduleStatus}
        </div>
      </div>

      <div className="pt-summary">
        <label className="pt-project-picker">
          <span className="pt-summary-icon">
            <MapPinned size={21} />
          </span>
          <span className="pt-picker-field">
            <small>Selected project</small>
            <select value={projectId} onChange={selectProject}>
              {!projects.length && (
                <option value="">No projects available</option>
              )}
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name || p.project_name || `Project ${p.id}`}
                </option>
              ))}
            </select>
          </span>
        </label>

        <div className="pt-summary-cell">
          <span className="pt-summary-icon">
            <span className="pt-calendar-symbol">▦</span>
          </span>
          <div>
            <small>Test case target window</small>
            <strong>
              {firstDate ? formatDate(firstDate, true) : 'No target dates'}
              {lastDate ? ` – ${formatDate(lastDate, true)}` : ''}
            </strong>
          </div>
        </div>

        <div className="pt-summary-cell">
          <span className="pt-progress-ring">{progress}%</span>
          <div className="pt-progress-details">
            <small>Test cases passed</small>
            <strong>{passed} of {total}</strong>
            <div className="pt-progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-workspace">
        <section className="pt-road-panel">
          <div className="pt-road-heading">
            <div>
              <h3>
                {project?.name || project?.project_name || 'Project roadmap'}
              </h3>
              <p>Drag to move around the map. Use your mouse wheel to zoom.</p>
            </div>

            <div className="pt-map-controls">
              <button
                type="button"
                title="Zoom out"
                onClick={() => changeZoom(-0.15)}
              >
                <ZoomOut size={16} />
              </button>
              <span>{Math.round(mapView.zoom * 100)}%</span>
              <button
                type="button"
                title="Zoom in"
                onClick={() => changeZoom(0.15)}
              >
                <ZoomIn size={16} />
              </button>
              <button type="button" onClick={resetMap}>
                <RefreshCw size={14} />
                Reset
              </button>
            </div>
          </div>

          {total === 0 ? (
            <div className="pt-empty">
              <div className="pt-empty-icon">
                <MapPinned size={30} />
              </div>
              <h3>No dated test cases yet</h3>
              <p>
                Select a project with test cases, or assign Target From and
                Target To dates to its test cases.
              </p>
            </div>
          ) : (
            <div
              className="pt-road-canvas"
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              onLostPointerCapture={handlePointerUp}
            >
              <div
                className="pt-map-world"
                style={{
                  width: `${mapWidth}px`,
                  height: `${mapHeight}px`,
                  transform: `translate(${mapView.x}px, ${mapView.y}px) scale(${mapView.zoom})`
                }}
              >
                <div className="pt-scenery pt-cloud pt-cloud-one" />
                <div className="pt-scenery pt-cloud pt-cloud-two" />
                <div className="pt-scenery pt-tree pt-tree-one">♣</div>
                <div className="pt-scenery pt-tree pt-tree-two">♣</div>
                <div className="pt-scenery pt-tree pt-tree-three">♣</div>
                <div className="pt-scenery pt-tree pt-tree-four">♣</div>

                <svg
                  className="pt-road-svg"
                  viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <filter id="pt-road-shadow">
                      <feGaussianBlur stdDeviation="7" />
                    </filter>
                    <linearGradient id="pt-road-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#566b78" />
                      <stop offset="100%" stopColor="#354c5a" />
                    </linearGradient>
                  </defs>

                  <path
                    d={roadPath}
                    fill="none"
                    stroke="#d8e3eb"
                    strokeWidth="94"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="translate(0 8)"
                    filter="url(#pt-road-shadow)"
                  />
                  <path
                    d={roadPath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="92"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={roadPath}
                    fill="none"
                    stroke="url(#pt-road-fill)"
                    strokeWidth="82"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={roadPath}
                    fill="none"
                    stroke="#f7f4d8"
                    strokeWidth="3"
                    strokeDasharray="22 20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {points.length > 0 && (
                    <>
                      <circle
                        cx={points[0].x}
                        cy={points[0].y}
                        r="15"
                        fill="#ffffff"
                        stroke="#15976a"
                        strokeWidth="7"
                      />
                      <circle
                        cx={points[points.length - 1].x}
                        cy={points[points.length - 1].y}
                        r="15"
                        fill="#ffffff"
                        stroke="#2878d0"
                        strokeWidth="7"
                      />
                    </>
                  )}
                </svg>

                <div
                  className="pt-road-label pt-start-label"
                  style={{ left: `${points[0].x - 32}px`, top: `${points[0].y + 65}px` }}
                >
                  START
                </div>
                <div
                  className="pt-road-label pt-end-label"
                  style={{
                    left: `${points[points.length - 1].x - 34}px`,
                    top: `${points[points.length - 1].y + 65}px`
                  }}
                >
                  FINISH
                </div>

                {points.map(point => {
                  const item = point.item;
                  const result = getResult(item);

                  return (
                    <div
                      key={item.id}
                      className={`pt-milestone ${point.above ? 'pt-above' : 'pt-below'}`}
                      style={{
                        left: `${point.x}px`,
                        top: `${point.y}px`,
                        '--milestone-color': point.color
                      }}
                    >
                      <article className="pt-case-card">
                        <div className="pt-card-topline">
                          <span>TEST CASE {point.index + 1}</span>
                          <span className="pt-case-id">#{item.id}</span>
                        </div>

                        <strong>
                          {item.module || item.title || `Test Case ${item.id}`}
                        </strong>

                        {item.sub_module && (
                          <span className="pt-card-subtitle">
                            {item.sub_module}
                          </span>
                        )}

                        <div className="pt-card-dates">
                          <span>{formatDate(item.target_from)}</span>
                          <span className="pt-date-arrow">→</span>
                          <span>{formatDate(item.target_to)}</span>
                        </div>

                        <span className="pt-result-pill">{result}</span>
                      </article>

                      <div className="pt-pin">
                        <span>{point.index + 1}</span>
                      </div>
                      <div className="pt-pin-shadow" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-map-footer">
            <span><i className="pt-legend-dot" style={{ background: STATUS_COLORS.Pass }} /> Pass</span>
            <span><i className="pt-legend-dot" style={{ background: STATUS_COLORS.Fail }} /> Fail</span>
            <span><i className="pt-legend-dot" style={{ background: STATUS_COLORS['For Review'] }} /> For Review</span>
            <span><i className="pt-legend-dot" style={{ background: STATUS_COLORS.Pending }} /> Pending</span>
          </div>
        </section>

        <aside className="pt-side-panel">
          <section className="pt-side-card">
            <h3>Test Case Status</h3>
            {[
              ['Pass', passed],
              ['Fail', failed],
              ['For Review', review],
              ['Pending', pending]
            ].map(([label, count]) => (
              <div className="pt-status-row" key={label}>
                <span
                  className="pt-status-dot"
                  style={{ background: STATUS_COLORS[label] }}
                />
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </section>

          <section className="pt-side-card">
            <h3>Progress Overview</h3>
            <div className="pt-side-progress">
              <div className="pt-progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
              <strong>{progress}%</strong>
            </div>
            <div className="pt-status-row">
              <span>Passed</span><strong>{passed}</strong>
            </div>
            <div className="pt-status-row">
              <span>Failed</span><strong>{failed}</strong>
            </div>
            <div className="pt-status-row">
              <span>For review</span><strong>{review}</strong>
            </div>
            <div className="pt-status-row">
              <span>Total dated cases</span><strong>{total}</strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
