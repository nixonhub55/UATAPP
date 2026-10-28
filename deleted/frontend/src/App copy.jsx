import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, BarChart3, Check, ChevronDown, ChevronRight, ClipboardCheck,
  FolderKanban, ImagePlus, LayoutDashboard, LogOut, Menu, MessageCircle, Plus, RefreshCw,
  Search, Settings2, ShieldCheck, Users, X, Send, CircleHelp, Bell, Copy, UserCheck, CheckCheck
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import api from './api';

const ROLE_LABEL = { PROJECT_INCHARGE: 'Project Incharge', TESTER: 'Tester', TECH_DEV: 'Tech/Dev' };
const COLORS = { Pass: '#15966b', Fail: '#dc4c4c', 'For Review': '#d99b2b', Open: '#3578c8', Closed: '#15966b' };
const prettyDate = d => d ? new Date(d).toLocaleDateString() : '—';
const errMsg = e => e.response?.data?.message || e.message || 'Something went wrong.';
const hasRole = (user, ...roles) => roles.includes(user?.role);

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@uat.local');
  const [password, setPassword] = useState('ChangeMe123!');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const { data } = await api.post('/auth/login', { email, password }); onLogin(data); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return <div className="login-screen">
    <div className="login-art"><div className="brand-mark"><ClipboardCheck size={28}/></div><p className="eyebrow">QUALITY · DELIVERY · CONFIDENCE</p><h1>Make every UAT<br/><span>count.</span></h1><p className="login-copy">A shared workspace for test execution, issue resolution, evidence, and project readiness.</p><div className="login-stat"><div><strong>01</strong><span>Plan</span></div><div><strong>02</strong><span>Test</span></div><div><strong>03</strong><span>Verify</span></div><div><strong>04</strong><span>Close</span></div></div></div>
    <form className="login-panel" onSubmit={submit}><div className="mobile-brand"><ClipboardCheck/> UAT Monitor</div><p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p className="muted">Use your assigned UAT account to continue.</p>
      {error && <div className="alert error"><AlertCircle size={17}/>{error}</div>}
      <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button className="btn primary full" disabled={busy}>{busy?'Signing in…':'Sign in'} <ChevronRight size={17}/></button>
      <div className="login-note"><ShieldCheck size={16}/> Role-based access · Local development</div>
      <p className="small muted">First-run demo account: admin@uat.local / ChangeMe123!</p>
    </form>
  </div>;
}

function Modal({ title, onClose, children, wide=false }) {
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className={`modal ${wide?'wide':''}`}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>;
}

function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('uat_user') || 'null'); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem('uat_token'));
  const [page, setPage] = useState('Dashboard');
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [dashboard, setDashboard] = useState({ results: [], statuses: [], severities: [], projects: [] });
  const [cases, setCases] = useState([]);
  const [masters, setMasters] = useState({ categories: [], results: [], statuses: [], severities: [] });
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filterResult, setFilterResult] = useState('All results');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [showBulkAssignment, setShowBulkAssignment] = useState(false);
  const [bulkCases, setBulkCases] = useState([]);
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [selectedCase, setSelectedCase] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [masterType, setMasterType] = useState('categories');

  const role = user?.role;
  const currentProject = projects.find(p => String(p.id) === String(projectId));
  const canManage = hasRole(user, 'PROJECT_INCHARGE');
  const canCreateCase = hasRole(user, 'PROJECT_INCHARGE', 'TESTER');

  function onLogin(data) {
    localStorage.setItem('uat_token', data.token); localStorage.setItem('uat_user', JSON.stringify(data.user));
    setToken(data.token); setUser(data.user); setPage('Dashboard');
  }
  function logout() {
    localStorage.removeItem('uat_token'); localStorage.removeItem('uat_user');
    setToken(null); setUser(null); setProjects([]); setCases([]); setProjectId('');
  }
  useEffect(() => { const fn=()=>logout(); window.addEventListener('uat:logout',fn); return ()=>window.removeEventListener('uat:logout',fn); }, []);
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [{data: p}, {data: d}] = await Promise.all([api.get('/projects'), api.get('/dashboard')]);
        setProjects(p); setDashboard(d);
        setProjectId(old => old && p.some(x=>String(x.id)===String(old)) ? old : String(p[0]?.id || ''));
        const masterEntries = await Promise.all(['categories','results','statuses','severities'].map(async k => [k,(await api.get(`/masters/${k}`)).data]));
        setMasters(Object.fromEntries(masterEntries));
        if (canManage) {
          const [{data:u},{data:a}] = await Promise.all([api.get('/users').catch(()=>({data:[]})),api.get('/activity')]);
          setUsers(u); setActivity(a);
        } else {
          const {data:a} = await api.get('/activity'); setActivity(a);
        }
        const {data:n} = await api.get('/notifications'); setNotifications(n.items || []); setUnreadNotifications(Number(n.unread || 0));
      } catch(e) { setError(errMsg(e)); }
    })();
  }, [token, canManage]);
  async function refresh() {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [{data:p},{data:d}] = await Promise.all([api.get('/projects'),api.get('/dashboard')]);
      setProjects(p); setDashboard(d);
      if (projectId) {
        const {data:c} = await api.get('/cases',{params:{projectId}});
        setCases(c);
      } else setCases([]);
      const [{data:a},{data:n}] = await Promise.all([api.get('/activity'),api.get('/notifications')]); setActivity(a); setNotifications(n.items||[]); setUnreadNotifications(Number(n.unread||0));
    } catch(e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!token || !projectId) { setCases([]); return; }
    api.get('/cases',{params:{projectId}}).then(({data})=>setCases(data)).catch(e=>setError(errMsg(e)));
    api.get(`/projects/${projectId}/assignments`).then(({data})=>setAssignments(data)).catch(()=>setAssignments([]));
  }, [token, projectId]);
  async function reloadMasters() {
    const entries = await Promise.all(['categories','results','statuses','severities'].map(async k => [k,(await api.get(`/masters/${k}`)).data]));
    setMasters(Object.fromEntries(entries));
  }
  async function saveProject(form) {
    const {data} = await api.post('/projects',form);
    setNotice('Project created successfully.'); setShowProjectModal(false);
    const {data:p} = await api.get('/projects'); setProjects(p); setProjectId(String(data.id));
    const {data:d} = await api.get('/dashboard'); setDashboard(d);
  }
  async function saveCase(form) {
    await api.post('/cases',{...form,project_id:Number(projectId)});
    setNotice('Test case created successfully.'); setShowCaseModal(false);
    const {data:c} = await api.get('/cases',{params:{projectId}}); setCases(c);
    const {data:d} = await api.get('/dashboard'); setDashboard(d);
  }
  async function updateCase(id, patch) {
    await api.patch(`/cases/${id}`,patch);
    const {data:c} = await api.get('/cases',{params:{projectId}}); setCases(c);
    const {data:d} = await api.get('/dashboard'); setDashboard(d);
    setSelectedCase(c.find(x=>Number(x.id)===Number(id)) || null);
    setNotice('Test case updated.');
  }
  async function duplicateProject(sourceId, payload) {
    const {data} = await api.post(`/projects/${sourceId}/duplicate`, payload);
    const [{data:p},{data:d},{data:n}] = await Promise.all([api.get('/projects'),api.get('/dashboard'),api.get('/notifications')]);
    setProjects(p); setDashboard(d); setNotifications(n.items||[]); setUnreadNotifications(Number(n.unread||0));
    setProjectId(String(data.id)); setDuplicateSource(null); setPage('Test Cases');
    setNotice(`Project duplicated with ${data.test_case_count} test case(s).`);
  }
  async function reloadNotifications() {
    const {data} = await api.get('/notifications'); setNotifications(data.items||[]); setUnreadNotifications(Number(data.unread||0));
  }
  async function markNotificationRead(id) {
    await api.patch(`/notifications/${id}/read`); await reloadNotifications();
  }
  async function markAllNotificationsRead() {
    await api.patch('/notifications/read-all'); await reloadNotifications();
  }

  const filteredCases = useMemo(()=>cases.filter(c => {
    const matchText = `${c.module} ${c.sub_module||''} ${c.steps} ${c.findings||''}`.toLowerCase().includes(query.toLowerCase());
    return matchText && (filterResult==='All results' || c.result===filterResult);
  }),[cases,query,filterResult]);

  if (!token || !user) return <Login onLogin={onLogin}/>;

  const nav = [
    {name:'Dashboard',icon:LayoutDashboard},
    {name:'Projects',icon:FolderKanban},
    {name:'Test Cases',icon:ClipboardCheck},
    {name:'Discussion',icon:MessageCircle},
    {name:'Notifications',icon:Bell},
    ...(canManage?[{name:'Users',icon:Users},{name:'Master Data',icon:Settings2}]:[]),
    {name:'Activity Log',icon:Activity}
  ];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <div className="side-brand"><div className="brand-mark"><ClipboardCheck size={22}/></div><div><strong>UAT<span> Monitor</span></strong><small>PROJECT QUALITY HUB</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{nav.map(n=><button key={n.name} className={`nav-item ${page===n.name?'active':''}`} onClick={()=>{setPage(n.name);setMobileNav(false);}}><n.icon size={18}/><span>{n.name}</span>{page===n.name&&<ChevronRight size={15} className="nav-chevron"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-box"><CircleHelp size={17}/><div><b>Need a hand?</b><small>Keep evidence and notes together.</small></div></div><div className="profile"><div className="avatar">{user.name?.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}</div><div className="profile-info"><b>{user.name}</b><small>{ROLE_LABEL[role]}</small></div><button title="Sign out" className="icon-btn" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    {mobileNav&&<div className="mobile-scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main-shell">
      <header className="topbar"><div className="top-left"><button className="icon-btn menu-toggle" onClick={()=>setMobileNav(true)}><Menu/></button><div><div className="breadcrumbs">Workspace <ChevronRight size={13}/> <b>{page}</b></div><h1>{page==='Dashboard'?'UAT overview':page}</h1></div></div><div className="top-actions"><div className="online-dot"/> <span className="role-chip">{ROLE_LABEL[role]}</span><button className="icon-btn notification-top-button" onClick={()=>{setPage('Notifications');reloadNotifications();}} title="Notifications"><Bell size={17}/>{unreadNotifications>0&&<span className="notification-dot">{unreadNotifications>99?'99+':unreadNotifications}</span>}</button><button className="icon-btn" onClick={refresh} title="Refresh data"><RefreshCw size={17}/></button></div></header>
      <div className="content">
        {error&&<div className="alert error"><AlertCircle size={17}/><span>{error}</span><button className="icon-btn" onClick={()=>setError('')}><X size={16}/></button></div>}
        {notice&&<div className="alert success"><Check size={17}/><span>{notice}</span><button className="icon-btn" onClick={()=>setNotice('')}><X size={16}/></button></div>}
        {page==='Dashboard'&&<DashboardPage dashboard={dashboard} projects={projects} cases={cases} onProject={id=>{setProjectId(String(id));setPage('Test Cases');}} onNew={()=>setShowProjectModal(true)} canManage={canManage}/>}
        {page==='Projects'&&<ProjectsPage projects={projects} canManage={canManage} onNew={()=>setShowProjectModal(true)} onDuplicate={p=>setDuplicateSource(p)} onOpen={id=>{setProjectId(String(id));setPage('Test Cases');}}/>}
        {page==='Test Cases'&&<CasesPage cases={filteredCases} allCases={cases} project={currentProject} projects={projects} projectId={projectId} setProjectId={setProjectId} query={query} setQuery={setQuery} filterResult={filterResult} setFilterResult={setFilterResult} canManage={canManage} canCreateCase={canCreateCase} user={user} masters={masters} onNew={()=>setShowCaseModal(true)} onOpen={c=>setSelectedCase(c)} onBulkAssign={items=>{setBulkCases(items);setShowBulkAssignment(true);}}/>}
        {page==='Discussion'&&<DiscussionPage cases={cases} onOpen={c=>setSelectedCase(c)}/> }
        {page==='Notifications'&&<NotificationsPage items={notifications} unread={unreadNotifications} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} onRefresh={reloadNotifications} onOpenProject={id=>{if(id){setProjectId(String(id));setPage('Test Cases');}}}/>}
        {page==='Users'&&canManage&&<UsersPage users={users} onCreated={async()=>{const {data}=await api.get('/users');setUsers(data);setNotice('User created.');}}/>}
        {page==='Master Data'&&canManage&&<MastersPage masters={masters} type={masterType} setType={setMasterType} reload={reloadMasters} onNotice={setNotice}/>}
        {page==='Activity Log'&&<ActivityPage activity={activity}/>}
      </div>
      <footer className="footer"><span>© {new Date().getFullYear()} UAT Monitor</span><span>Local workspace <i/> All changes are recorded</span></footer>
    </main>
    {showProjectModal&&<ProjectModal users={users} onClose={()=>setShowProjectModal(false)} onSave={saveProject}/>}
    {showBulkAssignment&&<BulkAssignmentModal project={currentProject} cases={bulkCases} users={assignments} onClose={()=>setShowBulkAssignment(false)} onSave={async payload=>{const {data}=await api.put(`/projects/${projectId}/case-assignments`,payload);const {data:c}=await api.get('/cases',{params:{projectId}});setCases(c);await reloadNotifications();setShowBulkAssignment(false);setNotice(data.message);}}/>}
    {duplicateSource&&<DuplicateProjectModal project={duplicateSource} users={users} onClose={()=>setDuplicateSource(null)} onSave={payload=>duplicateProject(duplicateSource.id,payload)}/> }
    {showCaseModal&&<CaseModal masters={masters} users={assignments.length?assignments:users} user={user} onClose={()=>setShowCaseModal(false)} onSave={saveCase}/>}
    {selectedCase&&<CaseDetail item={selectedCase} user={user} masters={masters} onClose={()=>setSelectedCase(null)} onUpdate={updateCase}/>}
  </div>;
}

function DashboardPage({dashboard,projects,cases,onProject,onNew,canManage}) {
  const total = Number(dashboard.results?.reduce((s,x)=>s+Number(x.total),0)||0);
  const passed = Number(dashboard.results?.find(x=>x.result==='Pass')?.total||0);
  const failed = Number(dashboard.results?.find(x=>x.result==='Fail')?.total||0);
  const review = Number(dashboard.results?.find(x=>x.result==='For Review')?.total||0);
  const closed = Number(dashboard.statuses?.find(x=>x.status==='Closed')?.total||0);
  const completion = total?Math.round(closed/total*100):0;
  const pie = ['Pass','Fail','For Review'].map(name=>({name,value:Number(dashboard.results?.find(x=>x.result===name)?.total||0)}));
  return <div className="page-stack">
    <div className="welcome-row"><div><p className="eyebrow">PROJECT HEALTH</p><h2>Good work starts with visibility.</h2><p className="muted">A live snapshot of testing progress, blockers, and sign-off readiness.</p></div>{canManage&&<button className="btn primary" onClick={onNew}><Plus size={17}/> New project</button>}</div>
    <div className="metric-grid">
      <Metric icon={ClipboardCheck} label="Total test cases" value={total} hint={`${projects.length} project${projects.length===1?'':'s'} in workspace`} tone="blue"/>
      <Metric icon={Check} label="Passed" value={passed} hint={total?`${Math.round(passed/total*100)}% of all cases`:'No test results yet'} tone="green"/>
      <Metric icon={AlertCircle} label="Failed" value={failed} hint="Needs a fix and retest" tone="red"/>
      <Metric icon={RefreshCw} label="For review" value={review} hint="Waiting for tester verification" tone="amber"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel chart-panel"><div className="panel-head"><div><h3>Test result distribution</h3><p className="muted">Latest result per test case</p></div><span className="mini-icon"><BarChart3 size={18}/></span></div>
        {total?<div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={pie.filter(x=>x.value>0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={64} outerRadius={91} paddingAngle={4}><Cell fill={COLORS.Pass}/><Cell fill={COLORS.Fail}/><Cell fill={COLORS['For Review']}/></Pie><Tooltip/><Legend verticalAlign="bottom" iconType="circle"/></PieChart></ResponsiveContainer><div className="chart-center"><strong>{total}</strong><span>test cases</span></div></div>:<EmptyState text="Create test cases to see the result distribution."/>}
      </section>
      <section className="panel"><div className="panel-head"><div><h3>Closure progress</h3><p className="muted">Cases formally closed by testers</p></div><span className="mini-icon"><Check size={18}/></span></div><div className="closure-circle" style={{'--progress':`${completion*3.6}deg`}}><div><strong>{completion}%</strong><span>closed</span></div></div><div className="progress-caption"><span>{closed} closed</span><span>{Math.max(total-closed,0)} still open</span></div><div className="progress-track"><div style={{width:`${completion}%`}}/></div><p className="muted small">A case should be closed only after a passing retest.</p></section>
    </div>
    <section className="panel"><div className="panel-head"><div><h3>Project portfolio</h3><p className="muted">Progress and outstanding work by project</p></div><span className="count-pill">{projects.length} projects</span></div>
      {projects.length?<div className="project-table-wrap"><table><thead><tr><th>Project</th><th>Test cases</th><th>Pass</th><th>Fail</th><th>For review</th><th>Progress</th><th></th></tr></thead><tbody>{projects.map(p=>{const t=Number(p.test_count||0),pa=Number(p.passed_count||0),percent=t?Math.round(pa/t*100):0;return <tr key={p.id}><td><div className="project-name"><div className="project-icon"><FolderKanban size={17}/></div><div><b>{p.name}</b><small>{p.code||`UAT-${p.id}`}</small></div></div></td><td>{t}</td><td><span className="number-green">{pa}</span></td><td><span className="number-red">{p.failed_count||0}</span></td><td>{p.review_count||0}</td><td><div className="table-progress"><div><span style={{width:`${percent}%`}}/></div><small>{percent}%</small></div></td><td><button className="btn tiny ghost" onClick={()=>onProject(p.id)}>Open <ChevronRight size={14}/></button></td></tr>})}</tbody></table></div>:<EmptyState text={canManage?'Create your first project to get started.':'You have not been assigned to a project yet.'}/>}
    </section>
  </div>;
}
function Metric({icon:Icon,label,value,hint,tone}){return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19}/></div><span className="metric-label">{label}</span><strong>{value}</strong><small>{hint}</small></div>}
function EmptyState({text}){return <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={22}/></div><p>{text}</p></div>}

function ProjectsPage({projects,canManage,onNew,onOpen,onDuplicate}) {
  return <div className="page-stack"><div className="section-title"><div><h2>Your projects</h2><p className="muted">Projects and their UAT readiness.</p></div>{canManage&&<button className="btn primary" onClick={onNew}><Plus size={17}/> Create project</button>}</div>
    <div className="project-cards">{projects.map(p=>{const total=Number(p.test_count||0),passed=Number(p.passed_count||0);return <article className="project-card" key={p.id}><div className="project-card-top"><div className="project-icon large"><FolderKanban size={20}/></div><span className="count-pill">{p.code||`UAT-${p.id}`}</span></div><h3>{p.name}</h3><p className="muted clamp">{p.description||'No project description provided.'}</p><div className="project-card-meta"><span><ClipboardCheck size={15}/>{total} test cases</span><span><Check size={15}/>{passed} passed</span></div><div className="progress-track"><div style={{width:`${total?passed/total*100:0}%`}}/></div><div className="project-card-bottom"><small>Target {prettyDate(p.target_date)}</small><div className="project-card-actions"><button className="btn ghost tiny" onClick={()=>onOpen(p.id)}>View project <ChevronRight size={14}/></button>{canManage&&<button className="btn secondary tiny" onClick={()=>onDuplicate(p)}><Copy size={13}/> Duplicate</button>}</div></div></article>})}{canManage&&<button className="project-card add-project" onClick={onNew}><div className="add-circle"><Plus/></div><b>Create another project</b><span className="muted small">Start planning a new UAT cycle</span></button>}</div>
  </div>;
}

function CasesPage({cases,allCases,project,projects,projectId,setProjectId,query,setQuery,filterResult,setFilterResult,canManage,canCreateCase,user,masters,onNew,onOpen,onBulkAssign}) {
  return <div className="page-stack"><div className="section-title"><div><h2>Test cases</h2><p className="muted">Checklists, findings, evidence, and retest history in one place.</p></div><div className="section-actions">{canManage&&project&&<button className="btn secondary" onClick={()=>onBulkAssign(allCases)}><UserCheck size={16}/> Assign / unassign users</button>}{canCreateCase&&<button className="btn primary" onClick={onNew}><Plus size={17}/> New test case</button>}</div></div>
    <div className="panel filter-panel"><div className="select-project"><label>Project</label><select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Choose a project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="search-box"><Search size={17}/><input placeholder="Search modules, steps, findings…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select className="filter-select" value={filterResult} onChange={e=>setFilterResult(e.target.value)}><option>All results</option>{masters.results.map(r=><option key={r.id}>{r.name}</option>)}</select></div>
    {project&&<div className="project-context"><div className="project-icon"><FolderKanban size={18}/></div><div><b>{project.name}</b><p className="muted small">{project.description||'Project UAT checklist and issue tracking'}</p></div><span className="count-pill">{cases.length} shown / {allCases.length} total</span></div>}
    {cases.length?<div className="case-list">{cases.map(c=><CaseRow key={c.id} item={c} onClick={()=>onOpen(c)}/>)}</div>:<div className="panel"><EmptyState text={project?'No matching test cases. Create a test case or adjust your filters.':'Select a project to view its test cases.'}/></div>}
  </div>;
}
function CaseRow({item,onClick}) {
  return <button className="case-row" onClick={onClick}><div className="case-main"><div className="case-id">TC-{String(item.id).padStart(4,'0')}</div><div className="case-text"><h3>{item.module}{item.sub_module?` / ${item.sub_module}`:''}</h3><p>{item.steps}</p><div className="case-meta"><span>{item.category}</span><span>•</span><span>{item.severity} severity</span><span>•</span><span>{item.attempt_count||0} attempts</span>{(item.assigned_testers||item.tester_name)&&<><span>•</span><span>Tester: {item.assigned_testers||item.tester_name}</span></>}{(item.assigned_techs||item.tech_name)&&<><span>•</span><span>Tech/Dev: {item.assigned_techs||item.tech_name}</span></>}<span>•</span><span><MessageCircle size={13}/>{item.comment_count||0}</span></div></div></div><div className="case-status"><ResultBadge value={item.result||'Not tested'}/><StatusBadge value={item.status}/><ChevronRight size={17} className="muted-icon"/></div></button>;
}
function ResultBadge({value}){const cls=value==='Pass'?'pass':value==='Fail'?'fail':value==='For Review'?'review':'neutral';return <span className={`badge ${cls}`}><i/>{value||'Not tested'}</span>}
function StatusBadge({value}){return <span className={`badge ${value==='Closed'?'pass':'open'}`}><i/>{value||'Open'}</span>}

function BulkAssignmentModal({project,cases,users,onClose,onSave}) {
  const [selectedCaseIds,setSelectedCaseIds]=useState([]);
  const [mode,setMode]=useState('assign');
  const [testerIds,setTesterIds]=useState([]);
  const [techIds,setTechIds]=useState([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const testers=users.filter(u=>u.role==='TESTER'&&Number(u.active??1)===1);
  const devs=users.filter(u=>u.role==='TECH_DEV'&&Number(u.active??1)===1);
  const toggle=(setter,ids,id)=>setter(ids.includes(Number(id))?ids.filter(x=>x!==Number(id)):[...ids,Number(id)]);
  function toggleAllCases(){setSelectedCaseIds(selectedCaseIds.length===cases.length?[]:cases.map(c=>Number(c.id)));}
  async function submit(e){e.preventDefault();if(!selectedCaseIds.length){setError('Select at least one test case.');return;}setBusy(true);setError('');try{if(!testerIds.length&&!techIds.length){setError('Select at least one user to assign or unassign.');setBusy(false);return;}await onSave({case_ids:selectedCaseIds,tester_ids:testerIds,tech_ids:techIds,mode});}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  return <Modal title="Bulk assign / unassign testcase users" onClose={onClose} wide><form className="form-grid bulk-assignment-form" onSubmit={submit}>
    <div className="span-2 bulk-explainer"><b>{project.name}</b><p className="muted small">Choose test cases and users, then choose whether to assign or unassign. Existing assignments for other users are preserved.</p></div>
    <div className="span-2"><div className="bulk-list-head"><b>1. Select test cases ({selectedCaseIds.length} selected)</b><button type="button" className="btn ghost tiny" onClick={toggleAllCases}>{selectedCaseIds.length===cases.length?'Clear selection':'Select all test cases'}</button></div>
      <div className="bulk-case-list">{cases.map(c=><label className="bulk-case-option" key={c.id}><input type="checkbox" checked={selectedCaseIds.includes(Number(c.id))} onChange={()=>toggle(setSelectedCaseIds,selectedCaseIds,c.id)}/><span><b>TC-{String(c.id).padStart(4,'0')} · {c.module}</b><small>{c.sub_module||c.steps?.slice(0,100)||'No additional details'}</small></span><ResultBadge value={c.result||'Not tested'}/></label>)}{!cases.length&&<p className="muted small">This project has no test cases yet.</p>}</div>
    </div>
    <div className="span-2"><b>2. Action</b><div className="assignment-mode"><button type="button" className={mode==='assign'?'active':''} onClick={()=>setMode('assign')}><UserCheck size={15}/> Assign selected users</button><button type="button" className={mode==='unassign'?'active':''} onClick={()=>setMode('unassign')} onDoubleClick={()=>{}}><X size={15}/> Unassign selected users</button></div></div><div className="span-2 bulk-user-columns"><div><div className="bulk-list-head"><b>3. Testers</b><button type="button" className="text-button" onClick={()=>setTesterIds(testerIds.length===testers.length?[]:testers.map(u=>Number(u.id)))}>{testerIds.length===testers.length?'Clear all':'Select all'}</button></div><div className="bulk-user-list">{testers.map(u=><label className="check-option" key={u.id}><input type="checkbox" checked={testerIds.includes(Number(u.id))} onChange={()=>toggle(setTesterIds,testerIds,u.id)}/>{u.name}</label>)}{!testers.length&&<p className="muted small">No active Testers are assigned to this project.</p>}</div></div>
    <div><div className="bulk-list-head"><b>4. Tech/Dev</b><button type="button" className="text-button" onClick={()=>setTechIds(techIds.length===devs.length?[]:devs.map(u=>Number(u.id)))}>{techIds.length===devs.length?'Clear all':'Select all'}</button></div><div className="bulk-user-list">{devs.map(u=><label className="check-option" key={u.id}><input type="checkbox" checked={techIds.includes(Number(u.id))} onChange={()=>toggle(setTechIds,techIds,u.id)}/>{u.name}</label>)}{!devs.length&&<p className="muted small">No active Tech/Dev users are assigned to this project.</p>}</div></div></div>
    <div className="span-2 alert assignment-warning"><CircleHelp size={16}/><span>This action affects only the checked users and selected test cases. Other existing assignments are preserved. To remove everyone, choose Unassign and select all currently assigned users.</span></div>
    {error&&<div className="alert error span-2">{error}</div>}<div className="form-actions span-2"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Saving assignments…':mode==='assign'?'Assign selected users':'Unassign selected users'}</button></div>
  </form></Modal>;
}

function DuplicateProjectModal({project,users,onClose,onSave}) {
  const [form,setForm]=useState({name:`${project.name} (Copy)`,code:'',start_date:project.start_date?String(project.start_date).slice(0,10):'',target_date:project.target_date?String(project.target_date).slice(0,10):'',copy_results:true,testerIds:[],devIds:[],piIds:[]});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const testers=users.filter(u=>u.role==='TESTER'&&Number(u.active)===1),devs=users.filter(u=>u.role==='TECH_DEV'&&Number(u.active)===1),pis=users.filter(u=>u.role==='PROJECT_INCHARGE'&&Number(u.active)===1);
  const toggle=(key,id)=>setForm(f=>({...f,[key]:f[key].includes(Number(id))?f[key].filter(x=>x!==Number(id)):[...f[key],Number(id)]}));
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await onSave({...form,assignments:[...form.testerIds.map(user_id=>({user_id,role:'TESTER'})),...form.devIds.map(user_id=>({user_id,role:'TECH_DEV'})),...form.piIds.map(user_id=>({user_id,role:'PROJECT_INCHARGE'}))]});}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  return <Modal title="Duplicate project" onClose={onClose} wide><form className="form-grid" onSubmit={submit}><div className="span-2 alert assignment-warning"><Copy size={16}/><span>Creates a separate project and copies testcase details. The original project is not changed. Comments, attachments, and test-attempt history are not copied.</span></div><label className="span-2">New project name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>New project code (optional)<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Leave blank for no code"/></label><label>Start date<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>Target date<input type="date" value={form.target_date} onChange={e=>setForm({...form,target_date:e.target.value})}/></label><label className="span-2 check-option copy-results-option"><input type="checkbox" checked={form.copy_results} onChange={e=>setForm({...form,copy_results:e.target.checked})}/><span><b>Copy current testcase results</b><small>Copies Pass/Fail/For Review, findings, technical notes, and tested dates. Turn this off for a clean UAT cycle.</small></span></label>
  <div className="span-2"><b>Project participants — choose who should be included</b><p className="muted small">Only selected users will be assigned to the new project. The signed-in Project Incharge is included automatically.</p></div>
  <UserChecklist title="Testers" users={testers} selected={form.testerIds} onToggle={id=>toggle('testerIds',id)}/><UserChecklist title="Tech/Dev" users={devs} selected={form.devIds} onToggle={id=>toggle('devIds',id)}/><UserChecklist title="Other Project Incharges" users={pis.filter(u=>Number(u.id)!==Number(JSON.parse(localStorage.getItem('uat_user')||'{}').id))} selected={form.piIds} onToggle={id=>toggle('piIds',id)}/>
  {error&&<div className="alert error span-2">{error}</div>}<div className="form-actions span-2"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Duplicating…':'Duplicate project'}</button></div></form></Modal>;
}
function UserChecklist({title,users,selected,onToggle}) {return <div className="duplicate-user-group"><b>{title}</b><div className="bulk-user-list">{users.map(u=><label className="check-option" key={u.id}><input type="checkbox" checked={selected.includes(Number(u.id))} onChange={()=>onToggle(u.id)}/>{u.name}</label>)}{!users.length&&<p className="muted small">No active users available.</p>}</div></div>}

function NotificationsPage({items,unread,onRead,onReadAll,onRefresh,onOpenProject}) {
  return <div className="page-stack"><div className="section-title"><div><h2>Notifications</h2><p className="muted">Assignments, project copies, and workspace updates.</p></div><div className="section-actions"><button className="btn ghost" onClick={onRefresh}><RefreshCw size={15}/> Refresh</button>{unread>0&&<button className="btn secondary" onClick={onReadAll}><CheckCheck size={15}/> Mark all read</button>}</div></div><div className="panel notification-list">{items.length?items.map(n=><article className={`notification-row ${Number(n.is_read)===1?'read':'unread'}`} key={n.id}><div className="notification-icon"><Bell size={17}/></div><div className="notification-copy"><b>{n.message}</b><p className="muted small">{n.project_name||'Workspace'} · {n.actor_name?`By ${n.actor_name} · `:''}{prettyDate(n.created_at)}</p><div className="notification-actions">{n.project_id&&<button className="text-button" onClick={()=>onOpenProject(n.project_id)}>Open project</button>}{Number(n.is_read)!==1&&<button className="text-button" onClick={()=>onRead(n.id)}>Mark read</button>}</div></div>{Number(n.is_read)!==1&&<span className="unread-dot"/>}</article>):<EmptyState text="You have no notifications yet."/>}</div></div>;
}

function ProjectModal({users,onClose,onSave}) {
  const [form,setForm]=useState({name:'',code:'',description:'',start_date:'',target_date:'',testerIds:[],devIds:[]});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const testers=users.filter(u=>u.role==='TESTER'),devs=users.filter(u=>u.role==='TECH_DEV');
  const toggle=(key,id)=>setForm(f=>({...f,[key]:f[key].includes(Number(id))?f[key].filter(x=>x!==Number(id)):[...f[key],Number(id)]}));
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await onSave({...form,assignments:[...form.testerIds.map(user_id=>({user_id,role:'TESTER'})),...form.devIds.map(user_id=>({user_id,role:'TECH_DEV'}))]});}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  return <Modal title="Create a project" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Project name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Billing System UAT"/></label><label>Project code<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="BILL-UAT"/></label><label>Start date<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>Target date<input type="date" value={form.target_date} onChange={e=>setForm({...form,target_date:e.target.value})}/></label><label className="span-2">Description<textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="span-2"><b>Assign testers</b>{testers.length?<div className="check-grid">{testers.map(u=><label className="check-option" key={u.id}><input type="checkbox" checked={form.testerIds.includes(Number(u.id))} onChange={()=>toggle('testerIds',u.id)}/>{u.name}</label>)}</div>:<p className="muted small">Create Tester accounts first in Users.</p>}</div><div className="span-2"><b>Assign Tech/Dev</b>{devs.length?<div className="check-grid">{devs.map(u=><label className="check-option" key={u.id}><input type="checkbox" checked={form.devIds.includes(Number(u.id))} onChange={()=>toggle('devIds',u.id)}/>{u.name}</label>)}</div>:<p className="muted small">Create Tech/Dev accounts first in Users.</p>}</div>{error&&<div className="alert error span-2">{error}</div>}<div className="form-actions span-2"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Creating…':'Create project'}</button></div></form></Modal>;
}

function CaseModal({masters,users,user,onClose,onSave}) {
  const [form,setForm]=useState({module:'',sub_module:'',steps:'',category_id:masters.categories[0]?.id||'',severity_id:masters.severities.find(x=>x.name==='Medium')?.id||masters.severities[0]?.id||'',target_from:'',target_to:'',assigned_tester_id:user.role==='TESTER'?user.id:'',assigned_tech_id:'',workflow_type:'CHECKLIST'});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await onSave({...form,category_id:Number(form.category_id),severity_id:Number(form.severity_id),status_id:masters.statuses.find(x=>x.name==='Open')?.id,assigned_tester_id:form.assigned_tester_id||null,assigned_tech_id:form.assigned_tech_id||null});}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  return <Modal title="Create test case" onClose={onClose} wide><form className="form-grid" onSubmit={submit}><label>Module *<input required value={form.module} onChange={e=>setForm({...form,module:e.target.value})} placeholder="Customer Management"/></label><label>Sub module<input value={form.sub_module} onChange={e=>setForm({...form,sub_module:e.target.value})} placeholder="Customer Registration"/></label><label className="span-2">What to check / steps *<textarea required rows="4" value={form.steps} onChange={e=>setForm({...form,steps:e.target.value})} placeholder="Describe the steps and expected result…"/></label><label>Category *<select required value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}>{masters.categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Severity *<select value={form.severity_id} onChange={e=>setForm({...form,severity_id:e.target.value})}>{masters.severities.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Target from<input type="date" value={form.target_from} onChange={e=>setForm({...form,target_from:e.target.value})}/></label><label>Target to<input type="date" value={form.target_to} onChange={e=>setForm({...form,target_to:e.target.value})}/></label><label>Assigned tester<select value={form.assigned_tester_id} onChange={e=>setForm({...form,assigned_tester_id:e.target.value})}><option value="">Unassigned</option>{users.filter(x=>x.role==='TESTER').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Assigned Tech/Dev<select value={form.assigned_tech_id} onChange={e=>setForm({...form,assigned_tech_id:e.target.value})}><option value="">Unassigned</option>{users.filter(x=>x.role==='TECH_DEV').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Workflow<select value={form.workflow_type} onChange={e=>setForm({...form,workflow_type:e.target.value})}><option value="CHECKLIST">Option 1 — Checklist</option><option value="ISSUE_RETEST">Option 2 — Issue & retest</option></select></label><div className="span-2 form-note"><CircleHelp size={16}/> Results are recorded after testing. Evidence and threaded discussion are added from the test case details.</div>{error&&<div className="alert error span-2">{error}</div>}<div className="form-actions span-2"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Saving…':'Create test case'}</button></div></form></Modal>;
}

function CaseDetail({item,user,masters,onClose,onUpdate}) {
  const [detail,setDetail]=useState(item),[comments,setComments]=useState([]),[attempts,setAttempts]=useState([]),[attachments,setAttachments]=useState([]);
  const [body,setBody]=useState(''),[replyTo,setReplyTo]=useState(null),[images,setImages]=useState([]),[attemptResult,setAttemptResult]=useState(''),[findings,setFindings]=useState(item.findings||''),[techComment,setTechComment]=useState(item.tech_comment||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const isTester=hasRole(user,'TESTER','PROJECT_INCHARGE'),isDev=hasRole(user,'TECH_DEV','PROJECT_INCHARGE');
  async function load(){const [{data:c},{data:a},{data:att}] = await Promise.all([api.get(`/cases/${item.id}/comments`),api.get(`/cases/${item.id}/attempts`),api.get(`/cases/${item.id}/attachments`)]);setComments(c);setAttempts(a);setAttachments(att);}
  useEffect(()=>{load().catch(e=>setError(errMsg(e)));},[item.id]);
  async function patch(data){setBusy(true);setError('');try{await onUpdate(item.id,data);setNotice('Changes saved.');const {data:c}=await api.get('/cases',{params:{projectId:item.project_id}});const updated=c.find(x=>Number(x.id)===Number(item.id));if(updated)setDetail(updated);await load();}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  async function postComment(e){e.preventDefault();if(!body.trim())return;setBusy(true);setError('');try{const fd=new FormData();fd.append('body',body);if(replyTo)fd.append('parent_id',replyTo);images.forEach(f=>fd.append('images',f));await api.post(`/cases/${item.id}/comments`,fd,{headers:{'Content-Type':'multipart/form-data'}});setBody('');setReplyTo(null);setImages([]);await load();setNotice('Comment posted.');}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  async function addAttempt(e){e.preventDefault();if(!attemptResult)return;setBusy(true);setError('');try{await api.post(`/cases/${item.id}/attempts`,{result_id:Number(attemptResult),findings});setNotice('Test attempt recorded.');setAttemptResult('');const {data:c}=await api.get('/cases',{params:{projectId:item.project_id}});const updated=c.find(x=>Number(x.id)===Number(item.id));if(updated)setDetail(updated);await load();}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  async function uploadEvidence(kind,files){if(!files.length)return;setBusy(true);setError('');try{const fd=new FormData();fd.append('kind',kind);Array.from(files).forEach(f=>fd.append('images',f));await api.post(`/cases/${item.id}/attachments`,fd,{headers:{'Content-Type':'multipart/form-data'}});setNotice('Images compressed and uploaded.');const {data}=await api.get(`/cases/${item.id}/attachments`);setAttachments(data);}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  const renderComments=(list,depth=0)=><div className={`comment-list depth-${Math.min(depth,3)}`}>{list.map(c=><div className="comment" key={c.id}><div className="comment-avatar">{c.user_name?.split(' ').map(s=>s[0]).join('').slice(0,2)}</div><div className="comment-content"><div className="comment-top"><b>{c.user_name}</b><span className="role-mini">{ROLE_LABEL[c.role]||c.role}</span><time>{new Date(c.created_at).toLocaleString()}</time></div><p>{c.body}</p>{c.attachments?.length>0&&<div className="attachment-grid">{c.attachments.map(a=><a key={a.id} href={`http://localhost:4000/uploads/${a.stored_name}`} target="_blank" rel="noreferrer"><img src={`http://localhost:4000/uploads/${a.stored_name}`} alt={a.original_name}/></a>)}</div>}<button className="text-button" onClick={()=>setReplyTo(c.id)}><MessageCircle size={13}/> Reply</button>{c.replies?.length>0&&renderComments(c.replies,depth+1)}</div></div>)}</div>;
  return <Modal title={`TC-${String(item.id).padStart(4,'0')} · ${item.module}`} onClose={onClose} wide><div className="detail-scroll">
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
    <div className="detail-subhead"><div><span className="eyebrow">{item.workflow_type==='ISSUE_RETEST'?'ISSUE & RETEST':'UAT CHECKLIST'}</span><h2>{detail.module}{detail.sub_module?` / ${detail.sub_module}`:''}</h2><p className="muted">{detail.steps}</p></div><div className="badge-stack"><ResultBadge value={detail.result||'Not tested'}/><StatusBadge value={detail.status}/></div></div>
    <div className="detail-grid"><div><span className="detail-label">Category</span><b>{detail.category}</b></div><div><span className="detail-label">Severity</span><b>{detail.severity}</b></div><div><span className="detail-label">Target window</span><b>{prettyDate(detail.target_from)} – {prettyDate(detail.target_to)}</b></div><div><span className="detail-label">Date tested</span><b>{prettyDate(detail.date_tested)}</b></div><div><span className="detail-label">Tester</span><b>{detail.tester_name||'Unassigned'}</b></div><div><span className="detail-label">Tech/Dev</span><b>{detail.tech_name||'Unassigned'}</b></div></div>
    <section className="detail-section"><div className="section-heading"><h3>Test execution</h3><span className="muted small">Each attempt is preserved</span></div>
      {isTester&&detail.status!=='Closed'&&<form className="attempt-form" onSubmit={addAttempt}><label>Record new test attempt<select required value={attemptResult} onChange={e=>setAttemptResult(e.target.value)}><option value="">Select result…</option>{masters.results.filter(x=>['Pass','Fail'].includes(x.name)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Findings<textarea rows="2" value={findings} onChange={e=>setFindings(e.target.value)} placeholder="Describe the observed result or issue…"/></label><button className="btn primary" disabled={busy||!attemptResult}><Plus size={15}/> Record attempt</button></form>}
      {hasRole(user,'TECH_DEV','PROJECT_INCHARGE')&&detail.result==='Fail'&&detail.status!=='Closed'&&<div className="dev-review"><p><b>Developer fix</b><span className="muted small"> After the fix is deployed, send the case back for tester verification.</span></p><button className="btn secondary" disabled={busy} onClick={()=>patch({result_id:masters.results.find(x=>x.name==='For Review')?.id})}>Mark For Review</button></div>}
      {attempts.length?<div className="attempt-list">{attempts.map(a=><div className="attempt-row" key={a.id}><div className="attempt-num">#{a.attempt_no}</div><div className="attempt-copy"><b>{a.result} · {a.tester_name}</b><p>{a.findings||'No findings entered.'}</p><small>{new Date(a.tested_at).toLocaleString()}</small></div><ResultBadge value={a.result}/></div>)}</div>:<p className="muted small">No test attempts recorded yet.</p>}
    </section>
    <section className="detail-section"><div className="section-heading"><h3>Evidence & technical notes</h3></div><div className="evidence-columns"><div className="evidence-box"><b>Findings evidence</b><p className="muted small">Tester / Project Incharge</p>{isTester&&<label className="upload-button"><ImagePlus size={16}/> Add images<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>uploadEvidence('findings',e.target.files)}/></label>}</div><div className="evidence-box"><b>Tech/Dev comment</b><p className="muted small">Technical fix details and screenshots</p>{isDev&&<><textarea rows="2" value={techComment} onChange={e=>setTechComment(e.target.value)} placeholder="What was changed?"/><button className="btn secondary tiny" onClick={()=>patch({tech_comment:techComment})}>Save note</button><label className="upload-button"><ImagePlus size={16}/> Add images<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>uploadEvidence('tech_comment',e.target.files)}/></label></>}</div></div>
      {attachments.length>0&&<div className="attachment-grid all-attachments">{attachments.map(a=><a key={a.id} href={`http://localhost:4000/uploads/${a.stored_name}`} target="_blank" rel="noreferrer"><img src={`http://localhost:4000/uploads/${a.stored_name}`} alt={a.original_name}/><small>{a.original_name} · {Math.round(a.size_bytes/1024)} KB</small></a>)}</div>}
    </section>
    <section className="detail-section"><div className="section-heading"><h3>Discussion</h3><span className="count-pill">{comments.length} top-level</span></div>{comments.length?renderComments(comments):<EmptyState text="Start the discussion. Replies stay threaded under each comment."/>}
      {replyTo&&<div className="replying-to">Replying to comment #{replyTo}<button className="text-button" onClick={()=>setReplyTo(null)}>Cancel</button></div>}
      <form className="comment-composer" onSubmit={postComment}><textarea rows="3" value={body} onChange={e=>setBody(e.target.value)} placeholder={replyTo?'Write a reply…':'Share a finding, question, or update…'} required/><div className="composer-bottom"><label className="upload-button"><ImagePlus size={16}/> Attach images<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setImages(Array.from(e.target.files||[]))}/></label><span className="muted small">{images.length?`${images.length} image(s) selected`:'JPG, PNG, WebP · max 12 MB each'}</span><button className="btn primary" disabled={busy||!body.trim()}><Send size={15}/> Post comment</button></div></form>
    </section>
    <section className="detail-section closure-section"><div><h3>Case status</h3><p className="muted small">Only the Tester can close a case after a passing result.</p></div>{hasRole(user,'TESTER')&&detail.status!=='Closed'&&detail.result==='Pass'&&<button className="btn primary" disabled={busy} onClick={()=>patch({status_id:masters.statuses.find(x=>x.name==='Closed')?.id})}><Check size={16}/> Close case</button>}{hasRole(user,'PROJECT_INCHARGE')&&detail.status==='Closed'&&<button className="btn ghost" disabled={busy} onClick={()=>patch({status_id:masters.statuses.find(x=>x.name==='Open')?.id})}>Reopen case</button>}</section>
  </div></Modal>;
}

function DiscussionPage({cases,onOpen}) {
  return <div className="page-stack"><div className="section-title"><div><h2>Project discussions</h2><p className="muted">Open a test case to view its threaded comments and evidence.</p></div></div>{cases.length?<div className="panel">{cases.map(c=><button className="discussion-row" key={c.id} onClick={()=>onOpen(c)}><div className="discussion-icon"><MessageCircle size={18}/></div><div><b>{c.module}{c.sub_module?` / ${c.sub_module}`:''}</b><p className="muted small">TC-{String(c.id).padStart(4,'0')} · {c.comment_count||0} comments · {c.project_name||'Selected project'}</p></div><ChevronRight size={17}/></button>)}</div>:<div className="panel"><EmptyState text="Select a project with test cases to view discussions."/></div>}</div>;
}

function UsersPage({users,onCreated}) {
  const [show,setShow]=useState(false),[form,setForm]=useState({name:'',email:'',password:'',role:'TESTER'}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await api.post('/users',form);setShow(false);setForm({name:'',email:'',password:'',role:'TESTER'});await onCreated();}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  return <div className="page-stack"><div className="section-title"><div><h2>User management</h2><p className="muted">Create accounts and assign UAT roles.</p></div><button className="btn primary" onClick={()=>setShow(true)}><Plus size={16}/> Add user</button></div><div className="panel"><div className="project-table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.name}</b></td><td>{u.email}</td><td><span className="role-chip">{ROLE_LABEL[u.role]}</span></td><td><span className={`badge ${u.active?'pass':'neutral'}`}>{u.active?'Active':'Inactive'}</span></td></tr>)}</tbody></table></div></div>
    {show&&<Modal title="Create user account" onClose={()=>setShow(false)}><form className="form-grid" onSubmit={submit}><label className="span-2">Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="span-2">Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="span-2">Temporary password (8+ characters)<input type="password" minLength="8" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><label className="span-2">Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="TESTER">Tester</option><option value="TECH_DEV">Tech/Dev</option><option value="PROJECT_INCHARGE">Project Incharge</option></select></label>{error&&<div className="alert error span-2">{error}</div>}<div className="form-actions span-2"><button type="button" className="btn ghost" onClick={()=>setShow(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Creating…':'Create user'}</button></div></form></Modal>}
  </div>;
}
function MastersPage({masters,type,setType,reload,onNotice}) {
  const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function create(e){e.preventDefault();setBusy(true);setError('');try{await api.post(`/masters/${type}`,{name});setName('');await reload();onNotice('Master value created.');}catch(e){setError(errMsg(e));}finally{setBusy(false);}}
  const labels={categories:'Category Master',results:'Result Master',statuses:'Status Master',severities:'Severity Master'};
  return <div className="page-stack"><div className="section-title"><div><h2>Master data</h2><p className="muted">Manage values used by test case forms.</p></div></div><div className="master-tabs">{Object.entries(labels).map(([k,v])=><button className={type===k?'active':''} key={k} onClick={()=>setType(k)}>{v}</button>)}</div><div className="panel master-panel"><div className="panel-head"><div><h3>{labels[type]}</h3><p className="muted">Changes are reflected in dropdowns throughout the app.</p></div><span className="count-pill">{masters[type]?.length||0} values</span></div><form className="master-add" onSubmit={create}><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Enter a new value…"/><button className="btn primary" disabled={busy}><Plus size={16}/> Add value</button></form>{error&&<div className="alert error">{error}</div>}<div className="master-values">{(masters[type]||[]).map((m,i)=><div className="master-value" key={m.id}><span className="master-index">{String(i+1).padStart(2,'0')}</span><b>{m.name}</b><span className={`badge ${m.active?'pass':'neutral'}`}>{m.active?'Active':'Inactive'}</span></div>)}</div></div></div>;
}
function ActivityPage({activity}) {
  return <div className="page-stack"><div className="section-title"><div><h2>Activity log</h2><p className="muted">Recent changes and collaboration events.</p></div></div><div className="panel activity-list">{activity.length?activity.map(a=><div className="activity-row" key={a.id}><div className="activity-dot"><Activity size={16}/></div><div><b>{a.user_name}</b><p>{a.action.replaceAll('_',' ').toLowerCase()} {a.project_name?`· ${a.project_name}`:''}</p><small>{new Date(a.created_at).toLocaleString()}</small></div></div>):<EmptyState text="No activity recorded yet."/>}</div></div>;
}
export default App;