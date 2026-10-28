import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { query, pool } from './db.js';
import { authenticate, allowRoles, signToken } from './auth.js';
import { upload, storeCompressedImage, uploadDir } from './uploads.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const PI = 'PROJECT_INCHARGE';
const TESTER = 'TESTER';
const DEV = 'TECH_DEV';
const staff = [PI, TESTER, DEV];

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
// Local-development convenience only. Protect this route or use authenticated file streaming in production.
app.use('/uploads', express.static(uploadDir));
app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, service: 'uat-monitoring-api' }); }
  catch { res.status(503).json({ ok: false, message: 'Database unavailable' }); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const rows = await query('SELECT id,name,email,password_hash,role,active FROM users WHERE email=? LIMIT 1', [String(email).trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    delete user.password_hash;
    res.json({ token: signToken(user), user });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.use('/api', authenticate);

async function canAccessProject(user, projectId) {
  if (user.role === PI) {
    const rows = await query('SELECT id FROM projects WHERE id=?', [projectId]);
    if (rows.length) return true;
  }
  const rows = await query('SELECT 1 FROM project_assignments WHERE project_id=? AND user_id=? AND assigned_role=?', [projectId, user.id, user.role]);
  return rows.length > 0;
}
async function canAccessCase(user, caseId) {
  const rows = await query('SELECT id,project_id,assigned_tester_id,assigned_tech_id FROM test_cases WHERE id=?', [caseId]);
  const item = rows[0];
  if (!item || !(await canAccessProject(user, Number(item.project_id)))) return false;
  // Project membership is not sufficient: Testers and Tech/Dev can only open cases assigned to them.
  if (user.role === PI) return true;
  if (user.role === TESTER) {
    const assigned = await query(`SELECT 1 FROM test_case_assignments WHERE test_case_id=? AND user_id=? AND assignment_type='TESTER' LIMIT 1`, [caseId, user.id]);
    return assigned.length > 0 || Number(item.assigned_tester_id) === Number(user.id);
  }
  if (user.role === DEV) {
    const assigned = await query(`SELECT 1 FROM test_case_assignments WHERE test_case_id=? AND user_id=? AND assignment_type='TECH_DEV' LIMIT 1`, [caseId, user.id]);
    return assigned.length > 0 || Number(item.assigned_tech_id) === Number(user.id);
  }
  return false;
}
async function isProjectCreatorForCase(userId, caseId) {
  const rows = await query('SELECT p.created_by FROM test_cases tc JOIN projects p ON p.id=tc.project_id WHERE tc.id=?', [caseId]);
  return rows.length > 0 && Number(rows[0].created_by) === Number(userId);
}
async function reopenCaseForScenarioChange(caseId, actorId, action, details = {}) {
  const rows = await query('SELECT project_id,status_id FROM test_cases WHERE id=?', [caseId]);
  if (!rows.length) return;
  const openRows = await query("SELECT id FROM status_master WHERE name='Open' LIMIT 1");
  // Any scenario definition change invalidates previous completion and requires a fresh run.
  await query('UPDATE test_cases SET result_id=NULL,date_tested=NULL,status_id=? WHERE id=?', [openRows[0]?.id || rows[0].status_id, caseId]);
  await logAction(actorId, rows[0].project_id, caseId, action, details);
}
async function logAction(userId, projectId, testCaseId, action, details = {}) {
  await query('INSERT INTO activity_logs(user_id,project_id,test_case_id,action,details) VALUES(?,?,?,?,?)',
    [userId, projectId || null, testCaseId || null, action, JSON.stringify(details)]);
}
async function notifyUsers(userIds, actorId, projectId, testCaseId, type, message) {
  const ids = [...new Set((userIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0 && id !== Number(actorId)))];
  for (const userId of ids) {
    await query('INSERT INTO notifications(user_id,actor_id,project_id,test_case_id,type,message) VALUES(?,?,?,?,?,?)',
      [userId, actorId || null, projectId || null, testCaseId || null, type, message]);
  }
}
const masterTables = {
  categories: { table: 'category_master', role: PI },
  results: { table: 'result_master', role: PI },
  statuses: { table: 'status_master', role: PI },
  severities: { table: 'severity_master', role: PI }
};
app.get('/api/masters/:type', async (req, res, next) => {
  try {
    const spec = masterTables[req.params.type];
    if (!spec) return res.status(404).json({ message: 'Unknown master type.' });
    res.json(await query(`SELECT id,name,active FROM ${spec.table} ORDER BY id`));
  } catch (e) { next(e); }
});
app.post('/api/masters/:type', allowRoles(PI), async (req, res, next) => {
  try {
    const spec = masterTables[req.params.type];
    const name = String(req.body?.name || '').trim();
    if (!spec || !name) return res.status(400).json({ message: 'Valid master type and name are required.' });
    await query(`INSERT INTO ${spec.table}(name) VALUES(?)`, [name]);
    res.status(201).json({ message: 'Master value created.' });
  } catch (e) { next(e); }
});
app.patch('/api/masters/:type/:id', allowRoles(PI), async (req, res, next) => {
  try {
    const spec = masterTables[req.params.type];
    if (!spec) return res.status(404).json({ message: 'Unknown master type.' });
    const name = String(req.body?.name || '').trim();
    const active = req.body?.active === undefined ? 1 : (req.body.active ? 1 : 0);
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    await query(`UPDATE ${spec.table} SET name=?,active=? WHERE id=?`, [name, active, req.params.id]);
    res.json({ message: 'Master value updated.' });
  } catch (e) { next(e); }
});

app.get('/api/users', allowRoles(PI), async (_req, res, next) => {
  try { res.json(await query('SELECT id,name,email,role,active,created_at FROM users ORDER BY name')); }
  catch (e) { next(e); }
});
app.post('/api/users', allowRoles(PI), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !staff.includes(role) || String(password).length < 8) {
      return res.status(400).json({ message: 'Name, email, valid role, and password (at least 8 characters) are required.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',
      [String(name).trim(), String(email).trim().toLowerCase(), hash, role]);
    res.status(201).json({ id: Number(result.insertId), message: 'User created.' });
  } catch (e) { next(e); }
});

app.get('/api/projects', async (req, res, next) => {
  try {
    let sql = `SELECT p.*, u.name AS creator_name,
      (SELECT COUNT(*) FROM test_cases tc WHERE tc.project_id=p.id) AS test_count,
      (SELECT COUNT(*) FROM test_cases tc JOIN result_master r ON r.id=tc.result_id WHERE tc.project_id=p.id AND r.name='Pass') AS passed_count,
      (SELECT COUNT(*) FROM test_cases tc JOIN result_master r ON r.id=tc.result_id WHERE tc.project_id=p.id AND r.name='Fail') AS failed_count,
      (SELECT COUNT(*) FROM test_cases tc JOIN result_master r ON r.id=tc.result_id WHERE tc.project_id=p.id AND r.name='For Review') AS review_count
      FROM projects p JOIN users u ON u.id=p.created_by`;
    const params = [];
    if (req.user.role !== PI) {
      sql += ' JOIN project_assignments pa ON pa.project_id=p.id WHERE pa.user_id=? AND pa.assigned_role=?';
      params.push(req.user.id, req.user.role);
    }
    sql += ' ORDER BY p.created_at DESC';
    res.json(await query(sql, params));
  } catch (e) { next(e); }
});
app.post('/api/projects', allowRoles(PI), async (req, res, next) => {
  try {
    const { name, code, description, start_date, target_date, assignments = [] } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ message: 'Project name is required.' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const p = await conn.query('INSERT INTO projects(name,code,description,start_date,target_date,created_by) VALUES(?,?,?,?,?,?)',
        [String(name).trim(), code || null, description || null, start_date || null, target_date || null, req.user.id]);
      const projectId = Number(p.insertId);
      await conn.query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)', [projectId, req.user.id, PI]);
      for (const a of assignments) {
        if (!a.user_id || ![TESTER, DEV].includes(a.role)) continue;
        await conn.query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)',
          [projectId, Number(a.user_id), a.role]);
      }
      await conn.commit();
      await notifyUsers(assignments.map(a=>Number(a.user_id)),req.user.id,projectId,null,'PROJECT_ASSIGNED',`You have been added to project “${String(name).trim()}”.`);
      res.status(201).json({ id: projectId, message: 'Project created.' });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { next(e); }
});
app.get('/api/projects/:id/assignments', async (req, res, next) => {
  try {
    if (!(await canAccessProject(req.user, req.params.id))) return res.status(403).json({ message: 'Project access denied.' });
    res.json(await query(`SELECT u.id,u.name,u.email,u.active,pa.assigned_role AS role FROM project_assignments pa JOIN users u ON u.id=pa.user_id WHERE pa.project_id=? ORDER BY u.name`, [req.params.id]));
  } catch (e) { next(e); }
});
app.post('/api/projects/:id/assignments', allowRoles(PI), async (req, res, next) => {
  try {
    const { user_id, role } = req.body || {};
    if (!user_id || ![TESTER, DEV, PI].includes(role)) return res.status(400).json({ message: 'Valid user and role are required.' });
    await query('INSERT INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE assigned_role=VALUES(assigned_role)', [req.params.id, user_id, role]);
    const projectRows=await query('SELECT name FROM projects WHERE id=?',[req.params.id]);
    if (!projectRows.length) return res.status(404).json({message:'Project not found.'});
    await notifyUsers([Number(user_id)],req.user.id,Number(req.params.id),null,'PROJECT_ASSIGNED',`You have been added to project “${projectRows[0].name}”.`);
    res.json({ message: 'Participant assigned.' });
  } catch (e) { next(e); }
});

// In-app notifications. Users can only read and update their own notifications.
app.get('/api/notifications', async (req, res, next) => {
  try {
    const rows = await query(`SELECT n.id,n.type,n.message,n.is_read,n.created_at,n.project_id,n.test_case_id,
      p.name AS project_name, u.name AS actor_name FROM notifications n
      LEFT JOIN projects p ON p.id=n.project_id LEFT JOIN users u ON u.id=n.actor_id
      WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100`, [req.user.id]);
    const unread = await query('SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=0', [req.user.id]);
    res.json({ items: rows, unread: Number(unread[0]?.total || 0) });
  } catch (e) { next(e); }
});
app.patch('/api/notifications/:id/read', async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marked as read.' });
  } catch (e) { next(e); }
});
app.patch('/api/notifications/read-all', async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0', [req.user.id]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (e) { next(e); }
});

// Mark comment/reply notifications for a test case as read when the user opens it.
app.patch('/api/notifications/case/:caseId/read', async (req, res, next) => {
  try {
    const caseId = Number(req.params.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      return res.status(400).json({ message: 'Invalid test case ID.' });
    }
    await query(`UPDATE notifications
      SET is_read=1
      WHERE user_id=? AND test_case_id=? AND is_read=0
        AND type IN ('COMMENT_ADDED','COMMENT_REPLY')`, [req.user.id, caseId]);
    res.json({ message: 'Comment notifications marked as read.' });
  } catch (e) { next(e); }
});

// Current multi-user assignments for all test cases in one project.
app.get('/api/projects/:id/case-assignments', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!(await canAccessProject(req.user, projectId))) return res.status(403).json({ message: 'Project access denied.' });
    const rows = await query(`SELECT tc.id AS test_case_id,
      GROUP_CONCAT(DISTINCT CASE WHEN a.assignment_type='TESTER' THEN a.user_id END) AS tester_ids,
      GROUP_CONCAT(DISTINCT CASE WHEN a.assignment_type='TECH_DEV' THEN a.user_id END) AS tech_ids
      FROM test_cases tc LEFT JOIN test_case_assignments a ON a.test_case_id=tc.id
      WHERE tc.project_id=? GROUP BY tc.id`, [projectId]);
    const legacy = await query('SELECT id,assigned_tester_id,assigned_tech_id FROM test_cases WHERE project_id=?', [projectId]);
    const byId = new Map(rows.map(r => [Number(r.test_case_id), {test_case_id:Number(r.test_case_id), tester_ids:(r.tester_ids ? r.tester_ids.split(',').map(Number) : []), tech_ids:(r.tech_ids ? r.tech_ids.split(',').map(Number) : [])}]));
    for (const c of legacy) {
      const item = byId.get(Number(c.id));
      if (!item.tester_ids.length && c.assigned_tester_id) item.tester_ids.push(Number(c.assigned_tester_id));
      if (!item.tech_ids.length && c.assigned_tech_id) item.tech_ids.push(Number(c.assigned_tech_id));
    }
    res.json([...byId.values()]);
  } catch (e) { next(e); }
});

// Bulk replace assignment sets for selected test cases. This supports both assigning and unassigning.
app.put('/api/projects/:id/case-assignments', allowRoles(PI), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const projectId = Number(req.params.id);
    const caseIds = [...new Set((req.body?.case_ids || []).map(Number).filter(Number.isInteger))];
    const testerIds = [...new Set((req.body?.tester_ids || []).map(Number).filter(Number.isInteger))];
    const techIds = [...new Set((req.body?.tech_ids || []).map(Number).filter(Number.isInteger))];
    const mode = req.body?.mode === 'unassign' ? 'unassign' : 'assign';
    if (!caseIds.length) return res.status(400).json({message:'Select at least one test case.'});
    if (!(await canAccessProject(req.user, projectId))) return res.status(403).json({message:'Project access denied.'});
    const caseRows = await query(`SELECT id,module FROM test_cases WHERE project_id=? AND id IN (${caseIds.map(()=>'?').join(',')})`, [projectId,...caseIds]);
    if (caseRows.length !== caseIds.length) return res.status(400).json({message:'One or more selected test cases do not belong to this project.'});
    const allIds = [...new Set([...testerIds,...techIds])];
    if (allIds.length) {
      const usersFound = await query(`SELECT id,role,active FROM users WHERE id IN (${allIds.map(()=>'?').join(',')})`, allIds);
      const userMap = new Map(usersFound.map(u=>[Number(u.id),u]));
      if (testerIds.some(id=>!userMap.has(id)||Number(userMap.get(id).active)!==1||userMap.get(id).role!==TESTER)) return res.status(400).json({message:'Select only active Tester accounts for the Tester list.'});
      if (techIds.some(id=>!userMap.has(id)||Number(userMap.get(id).active)!==1||userMap.get(id).role!==DEV)) return res.status(400).json({message:'Select only active Tech/Dev accounts for the Tech/Dev list.'});
      // Participant membership is created automatically below when assignments are saved.
    }
    await conn.beginTransaction();
    // Automatically add selected users as project participants before assigning them.
    // INSERT IGNORE respects the project/user primary key and avoids duplicates.
    if (mode !== 'unassign') {
      for (const id of testerIds) {
        await conn.query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)', [projectId,id,TESTER]);
      }
      for (const id of techIds) {
        await conn.query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)', [projectId,id,DEV]);
      }
    }
    for (const c of caseRows) {
      const caseId = Number(c.id);
      const oldRows = await conn.query('SELECT user_id,assignment_type FROM test_case_assignments WHERE test_case_id=?', [caseId]);
      let oldTesters = oldRows.filter(a=>a.assignment_type==='TESTER').map(a=>Number(a.user_id));
      let oldDevs = oldRows.filter(a=>a.assignment_type==='TECH_DEV').map(a=>Number(a.user_id));
      // Include legacy single-assignee columns for cases created before multi-assignment was enabled.
      const legacy = await conn.query('SELECT assigned_tester_id,assigned_tech_id FROM test_cases WHERE id=?', [caseId]);
      if (!oldTesters.length && legacy[0]?.assigned_tester_id) oldTesters=[Number(legacy[0].assigned_tester_id)];
      if (!oldDevs.length && legacy[0]?.assigned_tech_id) oldDevs=[Number(legacy[0].assigned_tech_id)];
      const targetTesters = mode === 'unassign' ? oldTesters.filter(id=>!testerIds.includes(id)) : [...new Set([...oldTesters,...testerIds])];
      const targetDevs = mode === 'unassign' ? oldDevs.filter(id=>!techIds.includes(id)) : [...new Set([...oldDevs,...techIds])];
      const added = [...targetTesters.filter(id=>!oldTesters.includes(id)), ...targetDevs.filter(id=>!oldDevs.includes(id))];
      const removed = [...oldTesters.filter(id=>!targetTesters.includes(id)), ...oldDevs.filter(id=>!targetDevs.includes(id))];
      await conn.query('DELETE FROM test_case_assignments WHERE test_case_id=?', [caseId]);
      for (const id of targetTesters) await conn.query('INSERT INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)', [caseId,id,'TESTER',req.user.id]);
      for (const id of targetDevs) await conn.query('INSERT INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)', [caseId,id,'TECH_DEV',req.user.id]);
      await conn.query('UPDATE test_cases SET assigned_tester_id=?,assigned_tech_id=? WHERE id=?', [targetTesters[0]||null,targetDevs[0]||null,caseId]);
      for (const id of added) await conn.query('INSERT INTO notifications(user_id,actor_id,project_id,test_case_id,type,message) VALUES(?,?,?,?,?,?)', [id,req.user.id,projectId,caseId,'TESTCASE_ASSIGNED',`You have been assigned to ${c.module} (TC-${String(caseId).padStart(4,'0')}).`]);
      for (const id of removed) await conn.query('INSERT INTO notifications(user_id,actor_id,project_id,test_case_id,type,message) VALUES(?,?,?,?,?,?)', [id,req.user.id,projectId,caseId,'TESTCASE_UNASSIGNED',`You have been unassigned from ${c.module} (TC-${String(caseId).padStart(4,'0')}).`]);
    }
    await conn.commit();
    await logAction(req.user.id,projectId,null,'BULK_CASE_ASSIGNMENTS_UPDATED',{caseIds,testerIds,techIds,mode});
    res.json({message:`Assignments updated for ${caseRows.length} test case(s).`,updated:caseRows.length});
  } catch (e) { await conn.rollback().catch(()=>{}); next(e); }
  finally { conn.release(); }
});

// Duplicate a project and its cases. Results are optionally copied; discussion/evidence history stays with the original.
app.post('/api/projects/:id/duplicate', allowRoles(PI), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const sourceId = Number(req.params.id);
    const sourceRows = await query('SELECT * FROM projects WHERE id=?', [sourceId]);
    if (!sourceRows.length) return res.status(404).json({message:'Source project not found.'});
    const source = sourceRows[0];
    const b = req.body || {};
    const name = String(b.name || `${source.name} (Copy)`).trim();
    if (!name) return res.status(400).json({message:'New project name is required.'});
    const copyResults = b.copy_results !== false;
    const participants = Array.isArray(b.assignments) ? b.assignments : [];
    const validUsers = participants.map(a=>({user_id:Number(a.user_id),role:a.role})).filter(a=>a.user_id>0&&[TESTER,DEV,PI].includes(a.role));
    if (validUsers.length) {
      const ids=[...new Set(validUsers.map(a=>a.user_id))];
      const rows=await query(`SELECT id,role,active FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
      const map=new Map(rows.map(u=>[Number(u.id),u]));
      if (ids.some(id=>!map.has(id)||Number(map.get(id).active)!==1)) return res.status(400).json({message:'All duplicate-project participants must be active users.'});
      if (validUsers.some(a=>map.get(a.user_id).role!==a.role)) return res.status(400).json({message:'A participant role does not match the selected user.'});
    }
    await conn.beginTransaction();
    const pResult = await conn.query('INSERT INTO projects(name,code,description,start_date,target_date,created_by) VALUES(?,?,?,?,?,?)',
      [name, b.code || null, source.description, b.start_date === undefined ? source.start_date : (b.start_date||null), b.target_date === undefined ? source.target_date : (b.target_date||null), req.user.id]);
    const newProjectId=Number(pResult.insertId);
    await conn.query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)',[newProjectId,req.user.id,PI]);
    const selectedUsers=new Set([Number(req.user.id)]);
    for (const a of validUsers) {
      await conn.query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)',[newProjectId,a.user_id,a.role]);
      selectedUsers.add(a.user_id);
    }
    const sourceCases=await conn.query('SELECT * FROM test_cases WHERE project_id=? ORDER BY id',[sourceId]);
    const openStatusRows=await conn.query("SELECT id FROM status_master WHERE name='Open' LIMIT 1");
    const defaultStatusId=Number(openStatusRows[0]?.id || sourceCases[0]?.status_id || 1);
    const idMap=new Map();
    for (const c of sourceCases) {
      const r=await conn.query(`INSERT INTO test_cases(project_id,module,sub_module,steps,category_id,severity_id,target_from,target_to,date_tested,findings,tech_comment,result_id,status_id,created_by,assigned_tester_id,assigned_tech_id,workflow_type)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [newProjectId,c.module,c.sub_module,c.steps,c.category_id,c.severity_id,c.target_from,c.target_to,copyResults?c.date_tested:null,copyResults?c.findings:null,copyResults?c.tech_comment:null,copyResults?c.result_id:null,(copyResults?c.status_id:defaultStatusId),req.user.id,null,null,c.workflow_type]);
      idMap.set(Number(c.id),Number(r.insertId));
    }
    const sourceAssignments=await conn.query(`SELECT a.test_case_id,a.user_id,a.assignment_type FROM test_case_assignments a JOIN test_cases tc ON tc.id=a.test_case_id WHERE tc.project_id=?`,[sourceId]);
    for (const a of sourceAssignments) if (idMap.has(Number(a.test_case_id))&&selectedUsers.has(Number(a.user_id))) {
      await conn.query('INSERT IGNORE INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)',[idMap.get(Number(a.test_case_id)),a.user_id,a.assignment_type,req.user.id]);
    }
    // Carry over legacy assignees when they were included as participants in the duplicate.
    for (const c of sourceCases) {
      const newId=idMap.get(Number(c.id));
      const testers=sourceAssignments.filter(a=>Number(a.test_case_id)===Number(c.id)&&a.assignment_type==='TESTER').map(a=>Number(a.user_id));
      const devs=sourceAssignments.filter(a=>Number(a.test_case_id)===Number(c.id)&&a.assignment_type==='TECH_DEV').map(a=>Number(a.user_id));
      if (!testers.length&&c.assigned_tester_id&&selectedUsers.has(Number(c.assigned_tester_id))) testers.push(Number(c.assigned_tester_id));
      if (!devs.length&&c.assigned_tech_id&&selectedUsers.has(Number(c.assigned_tech_id))) devs.push(Number(c.assigned_tech_id));
      for (const uid of testers) await conn.query('INSERT IGNORE INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)',[newId,uid,'TESTER',req.user.id]);
      for (const uid of devs) await conn.query('INSERT IGNORE INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)',[newId,uid,'TECH_DEV',req.user.id]);
      await conn.query('UPDATE test_cases SET assigned_tester_id=?,assigned_tech_id=? WHERE id=?',[testers[0]||null,devs[0]||null,newId]);
    }
    await conn.commit();
    await logAction(req.user.id,newProjectId,null,'PROJECT_DUPLICATED',{sourceProjectId:sourceId,sourceName:source.name,copyResults,testCases:sourceCases.length});
    await notifyUsers([...selectedUsers],req.user.id,newProjectId,null,'PROJECT_DUPLICATED',`Project “${name}” was created as a copy of “${source.name}”.`);
    res.status(201).json({id:newProjectId,message:'Project duplicated.',test_case_count:sourceCases.length,copy_results:copyResults});
  } catch(e) { await conn.rollback().catch(()=>{}); next(e); }
  finally { conn.release(); }
});

app.get('/api/cases', async (req, res, next) => {
  try {
    const projectId = req.query.projectId;
    if (!projectId || !(await canAccessProject(req.user, projectId))) return res.status(403).json({ message: 'Choose a project you can access.' });
    const rows = await query(`SELECT tc.*,
      (SELECT pcr.created_by FROM projects pcr WHERE pcr.id=tc.project_id) AS project_created_by,
      (SELECT COUNT(*) FROM test_case_scenarios sc WHERE sc.test_case_id=tc.id) AS scenario_count,
      (SELECT CASE WHEN COUNT(*)=0 THEN NULL WHEN SUM(CASE WHEN sr.result='Not OK' THEN 1 ELSE 0 END)>0 THEN 'Fail' WHEN SUM(CASE WHEN sr.result='OK' THEN 1 ELSE 0 END)=COUNT(*) THEN 'Tested' ELSE 'Pending' END
        FROM test_case_scenarios sc LEFT JOIN test_case_scenario_results sr ON sr.scenario_id=sc.id AND sr.tester_id=? WHERE sc.test_case_id=tc.id) AS tester_scenario_status,
      c.name AS category, r.name AS result, s.name AS status, sev.name AS severity,
      tu.name AS tester_name, du.name AS tech_name, creator.name AS creator_name,
      (SELECT COUNT(*) FROM comments cm WHERE cm.test_case_id=tc.id) AS comment_count,
      (SELECT COUNT(*) FROM test_attempts ta WHERE ta.test_case_id=tc.id) AS attempt_count,
      (SELECT GROUP_CONCAT(DISTINCT a.user_id) FROM test_case_assignments a WHERE a.test_case_id=tc.id AND a.assignment_type='TESTER') AS assigned_tester_ids,
      (SELECT GROUP_CONCAT(DISTINCT a.user_id) FROM test_case_assignments a WHERE a.test_case_id=tc.id AND a.assignment_type='TECH_DEV') AS assigned_tech_ids,
      (SELECT GROUP_CONCAT(DISTINCT au.name ORDER BY au.name SEPARATOR ', ') FROM test_case_assignments a JOIN users au ON au.id=a.user_id WHERE a.test_case_id=tc.id AND a.assignment_type='TESTER') AS assigned_testers,
      (SELECT GROUP_CONCAT(DISTINCT au.name ORDER BY au.name SEPARATOR ', ') FROM test_case_assignments a JOIN users au ON au.id=a.user_id WHERE a.test_case_id=tc.id AND a.assignment_type='TECH_DEV') AS assigned_techs
      FROM test_cases tc JOIN category_master c ON c.id=tc.category_id
      LEFT JOIN result_master r ON r.id=tc.result_id JOIN status_master s ON s.id=tc.status_id
      JOIN severity_master sev ON sev.id=tc.severity_id
      LEFT JOIN users tu ON tu.id=tc.assigned_tester_id LEFT JOIN users du ON du.id=tc.assigned_tech_id
      JOIN users creator ON creator.id=tc.created_by WHERE tc.project_id=?
      AND (?='PROJECT_INCHARGE' OR
        (?='TESTER' AND (EXISTS(SELECT 1 FROM test_case_assignments ax WHERE ax.test_case_id=tc.id AND ax.user_id=? AND ax.assignment_type='TESTER') OR tc.assigned_tester_id=?)) OR
        (?='TECH_DEV' AND (EXISTS(SELECT 1 FROM test_case_assignments ax WHERE ax.test_case_id=tc.id AND ax.user_id=? AND ax.assignment_type='TECH_DEV') OR tc.assigned_tech_id=?)))
      ORDER BY tc.updated_at DESC`, [req.user.id, projectId, req.user.role, req.user.role, req.user.id, req.user.id, req.user.role, req.user.id, req.user.id]);
    res.json(rows.map(r=>({...r,
      assigned_tester_ids: r.assigned_tester_ids ? r.assigned_tester_ids.split(',').map(Number) : (r.assigned_tester_id ? [Number(r.assigned_tester_id)] : []),
      assigned_tech_ids: r.assigned_tech_ids ? r.assigned_tech_ids.split(',').map(Number) : (r.assigned_tech_id ? [Number(r.assigned_tech_id)] : [])
    })));
  } catch (e) { next(e); }
});
app.post('/api/cases', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.project_id || !(await canAccessProject(req.user, b.project_id))) return res.status(403).json({ message: 'Project access denied.' });
    if (![PI, TESTER].includes(req.user.role)) return res.status(403).json({ message: 'Only Project Incharge and Testers can create test cases.' });
    if (!b.module || !b.steps || !b.category_id || !b.severity_id || !b.status_id) return res.status(400).json({ message: 'Module, steps, category, severity and status are required.' });
    const testerIds = [...new Set((Array.isArray(b.assigned_tester_ids) ? b.assigned_tester_ids : (b.assigned_tester_id ? [b.assigned_tester_id] : [])).map(Number).filter(Number.isInteger))];
    if (req.user.role === TESTER && !testerIds.includes(Number(req.user.id))) testerIds.push(Number(req.user.id));
    const techIds = [...new Set((Array.isArray(b.assigned_tech_ids) ? b.assigned_tech_ids : (b.assigned_tech_id ? [b.assigned_tech_id] : [])).map(Number).filter(Number.isInteger))];
    const allAssignedIds = [...new Set([...testerIds, ...techIds])];
    if (allAssignedIds.length) {
      const found = await query(`SELECT id,role,active FROM users WHERE id IN (${allAssignedIds.map(()=>'?').join(',')})`, allAssignedIds);
      const userMap = new Map(found.map(u=>[Number(u.id),u]));
      if (testerIds.some(id=>!userMap.has(id)||Number(userMap.get(id).active)!==1||userMap.get(id).role!==TESTER)) return res.status(400).json({message:'Select only active Tester accounts for Tester assignments.'});
      if (techIds.some(id=>!userMap.has(id)||Number(userMap.get(id).active)!==1||userMap.get(id).role!==DEV)) return res.status(400).json({message:'Select only active Tech/Dev accounts for Tech/Dev assignments.'});
      // Project participation is added automatically for users assigned during case creation.
    }
    // Ensure every assigned user is a project participant before creating the case.
    for (const id of testerIds) {
      await query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)', [Number(b.project_id),id,TESTER]);
    }
    for (const id of techIds) {
      await query('INSERT IGNORE INTO project_assignments(project_id,user_id,assigned_role) VALUES(?,?,?)', [Number(b.project_id),id,DEV]);
    }
    const result = await query(`INSERT INTO test_cases(project_id,module,sub_module,steps,category_id,severity_id,target_from,target_to,status_id,created_by,assigned_tester_id,assigned_tech_id,workflow_type)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      b.project_id, b.module, b.sub_module || null, b.steps, b.category_id, b.severity_id,
      b.target_from || null, b.target_to || null, b.status_id, req.user.id,
      testerIds[0] || null, techIds[0] || null, b.workflow_type === 'ISSUE_RETEST' ? 'ISSUE_RETEST' : 'CHECKLIST'
    ]);
    const caseId = Number(result.insertId);
    for (const id of testerIds) await query('INSERT IGNORE INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)',[caseId,id,'TESTER',req.user.id]);
    for (const id of techIds) await query('INSERT IGNORE INTO test_case_assignments(test_case_id,user_id,assignment_type,assigned_by) VALUES(?,?,?,?)',[caseId,id,'TECH_DEV',req.user.id]);
    await logAction(req.user.id, b.project_id, caseId, 'CASE_CREATED', { module: b.module, testerIds, techIds });
    await notifyUsers(allAssignedIds,req.user.id,Number(b.project_id),caseId,'TESTCASE_ASSIGNED',`You have been assigned to ${b.module}.`);
    res.status(201).json({ id: caseId, message: 'Test case created.' });
  } catch (e) { next(e); }
});
app.patch('/api/cases/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!(await canAccessCase(req.user, id))) return res.status(403).json({ message: 'Case access denied.' });
    const rows = await query('SELECT * FROM test_cases WHERE id=?', [id]);
    const current = rows[0];
    if (!current) return res.status(404).json({ message: 'Test case not found.' });
    const b = req.body || {};
    const currentStatusRows = current.status_id ? await query('SELECT name FROM status_master WHERE id=?', [current.status_id]) : [];
    const isClosed = currentStatusRows[0]?.name === 'Closed';
    if (isClosed) {
      const isCreator = req.user.role === PI && await isProjectCreatorForCase(req.user.id, id);
      const openStatus = await query("SELECT id FROM status_master WHERE name='Open' LIMIT 1");
      const isReopenRequest = isCreator && b.status_id !== undefined && Number(b.status_id) === Number(openStatus[0]?.id) && Object.keys(b).every(k => k === 'status_id');
      if (!isReopenRequest) return res.status(403).json({ message: 'This test case is Closed and read-only. Only the Project Creator can reopen it first.' });
      await query('UPDATE test_cases SET status_id=?, result_id=NULL, date_tested=NULL WHERE id=?', [openStatus[0].id, id]);
      await logAction(req.user.id, current.project_id, id, 'TEST_CASE_REOPENED', { reason: 'Project Creator reopened case for retesting.' });
      return res.json({ message: 'Test case reopened. Testers can now update scenario results.' });
    }
    const changes = [];
    const params = [];
    const add = (field, value) => { changes.push(`${field}=?`); params.push(value); };
    if (b.module !== undefined && req.user.role === PI) add('module', b.module);
    if (b.sub_module !== undefined && req.user.role === PI) add('sub_module', b.sub_module || null);
    if (b.steps !== undefined && req.user.role === PI) add('steps', b.steps);
    if (b.category_id !== undefined && req.user.role === PI) add('category_id', b.category_id);
    if (b.severity_id !== undefined && req.user.role === PI) add('severity_id', b.severity_id);
    if (b.target_from !== undefined && req.user.role === PI) add('target_from', b.target_from || null);
    if (b.target_to !== undefined && req.user.role === PI) add('target_to', b.target_to || null);
    if (b.assigned_tester_id !== undefined && req.user.role === PI) add('assigned_tester_id', b.assigned_tester_id || null);
    if (b.assigned_tech_id !== undefined && req.user.role === PI) add('assigned_tech_id', b.assigned_tech_id || null);
    if (b.findings !== undefined && [PI, TESTER].includes(req.user.role)) add('findings', b.findings);
    if (b.tech_comment !== undefined && [PI, DEV].includes(req.user.role)) add('tech_comment', b.tech_comment);
    if (b.result_id !== undefined) {
      if (![PI, TESTER, DEV].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed to update result.' });
      const resultRows = await query('SELECT name FROM result_master WHERE id=?', [b.result_id]);
      const resultName = resultRows[0]?.name;
      if (req.user.role === DEV && resultName !== 'For Review') return res.status(403).json({ message: 'Tech/Dev can set result to For Review after a fix. A Tester records Pass or Fail.' });
      if (req.user.role === TESTER && !['Pass','Fail'].includes(resultName)) return res.status(403).json({ message: 'Tester records Pass or Fail.' });
      add('result_id', b.result_id);
      if (resultName === 'Pass') add('date_tested', b.date_tested || new Date().toISOString().slice(0,10));
    }
    if (b.status_id !== undefined) {
      const statusRows = await query('SELECT name FROM status_master WHERE id=?', [b.status_id]);
      const statusName = statusRows[0]?.name;
      if (statusName === 'Closed') {
        if (req.user.role !== TESTER) return res.status(403).json({ message: 'Only the Tester can close a test case.' });
        const resultNameRows = current.result_id ? await query('SELECT name FROM result_master WHERE id=?', [current.result_id]) : [];
        const newResultRows = b.result_id ? await query('SELECT name FROM result_master WHERE id=?', [b.result_id]) : [];
        if ((newResultRows[0]?.name || resultNameRows[0]?.name) !== 'Pass') return res.status(400).json({ message: 'A case can be closed only after the latest result is Pass.' });
      }
      if (statusName !== 'Closed' && req.user.role !== PI) return res.status(403).json({ message: 'Only Project Incharge can change case status.' });
      if (statusName === 'Open' && current.status_id) {
        const oldStatus = await query('SELECT name FROM status_master WHERE id=?', [current.status_id]);
        if (oldStatus[0]?.name === 'Closed') return res.status(403).json({ message: 'A closed scenario test case can only be reopened when its project creator adds, edits, or deletes a scenario.' });
      }
      add('status_id', b.status_id);
    }
    if (!changes.length) return res.json({ message: 'No permitted changes supplied.' });
    params.push(id);
    await query(`UPDATE test_cases SET ${changes.join(',')} WHERE id=?`, params);
    await logAction(req.user.id, current.project_id, id, 'CASE_UPDATED', b);
    res.json({ message: 'Test case updated.' });
  } catch (e) { next(e); }
});

// Scenario steps are shared by a test case; each Tester has independent results for each step.
app.get('/api/cases/:id/scenarios', async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);
    if (!(await canAccessCase(req.user, caseId))) return res.status(403).json({ message: 'Case access denied. Only assigned users can view this test case.' });
    const scenarios = await query('SELECT id,test_case_id,step_no,scenario_text,created_by,created_at FROM test_case_scenarios WHERE test_case_id=? ORDER BY step_no,id', [caseId]);
    if (!scenarios.length) return res.json([]);
    const ids = scenarios.map(x => Number(x.id));
    const results = await query(`SELECT r.id,r.scenario_id,r.tester_id,r.result,r.notes,r.updated_at,u.name AS tester_name
      FROM test_case_scenario_results r JOIN users u ON u.id=r.tester_id
      WHERE r.scenario_id IN (${ids.map(()=>'?').join(',')}) ORDER BY u.name`, ids);
    res.json(scenarios.map(s => ({ ...s, results: results.filter(r => Number(r.scenario_id) === Number(s.id)) })));
  } catch (e) { next(e); }
});
app.post('/api/cases/:id/scenarios', allowRoles(PI), async (req, res, next) => {
  try {
    const caseId = Number(req.params.id);
    if (!(await canAccessCase(req.user, caseId))) return res.status(403).json({ message: 'Case access denied.' });
    if (!(await isProjectCreatorForCase(req.user.id, caseId))) return res.status(403).json({ message: 'Only the project creator can add or edit scenario steps.' });
    const scenarioText = String(req.body?.scenario_text || '').trim();
    if (!scenarioText) return res.status(400).json({ message: 'Scenario step text is required.' });
    const rows = await query('SELECT COALESCE(MAX(step_no),0)+1 AS next_step FROM test_case_scenarios WHERE test_case_id=?', [caseId]);
    const result = await query('INSERT INTO test_case_scenarios(test_case_id,step_no,scenario_text,created_by) VALUES(?,?,?,?)', [caseId, Number(rows[0].next_step), scenarioText, req.user.id]);
    await reopenCaseForScenarioChange(caseId, req.user.id, 'SCENARIO_STEP_ADDED', { scenarioId: Number(result.insertId), stepNo: Number(rows[0].next_step) });
    res.status(201).json({ id: Number(result.insertId), message: 'Scenario step added. Test case reopened for retesting.' });
  } catch (e) { next(e); }
});
app.patch('/api/cases/:id/scenarios/:scenarioId', allowRoles(PI), async (req, res, next) => {
  try {
    const caseId = Number(req.params.id), scenarioId = Number(req.params.scenarioId);
    if (!(await canAccessCase(req.user, caseId))) return res.status(403).json({ message: 'Case access denied.' });
    if (!(await isProjectCreatorForCase(req.user.id, caseId))) return res.status(403).json({ message: 'Only the project creator can add or edit scenario steps.' });
    const scenarioText = String(req.body?.scenario_text || '').trim();
    if (!scenarioText) return res.status(400).json({ message: 'Scenario step text is required.' });
    const existing = await query('SELECT id FROM test_case_scenarios WHERE id=? AND test_case_id=?', [scenarioId, caseId]);
    if (!existing.length) return res.status(404).json({ message: 'Scenario step not found.' });
    await query('UPDATE test_case_scenarios SET scenario_text=? WHERE id=? AND test_case_id=?', [scenarioText, scenarioId, caseId]);
    await reopenCaseForScenarioChange(caseId, req.user.id, 'SCENARIO_STEP_EDITED', { scenarioId });
    res.json({ message: 'Scenario step updated. Test case reopened for retesting.' });
  } catch (e) { next(e); }
});
app.delete('/api/cases/:id/scenarios/:scenarioId', allowRoles(PI), async (req, res, next) => {
  try {
    const caseId = Number(req.params.id), scenarioId = Number(req.params.scenarioId);
    if (!(await canAccessCase(req.user, caseId))) return res.status(403).json({ message: 'Case access denied.' });
    if (!(await isProjectCreatorForCase(req.user.id, caseId))) return res.status(403).json({ message: 'Only the project creator can delete scenario steps.' });
    await query('DELETE FROM test_case_scenarios WHERE id=? AND test_case_id=?', [scenarioId, caseId]);
    const remaining = await query('SELECT id FROM test_case_scenarios WHERE test_case_id=? ORDER BY step_no,id', [caseId]);
    for (let i=0;i<remaining.length;i++) await query('UPDATE test_case_scenarios SET step_no=? WHERE id=?', [i+1, remaining[i].id]);
    await reopenCaseForScenarioChange(caseId, req.user.id, 'SCENARIO_STEP_DELETED', { scenarioId });
    res.json({ message: 'Scenario step deleted. Test case reopened for retesting.' });
  } catch (e) { next(e); }
});
app.patch('/api/cases/:id/scenarios/:scenarioId/result', allowRoles(TESTER), async (req, res, next) => {
  try {
    const caseId = Number(req.params.id), scenarioId = Number(req.params.scenarioId);
    if (!(await canAccessCase(req.user, caseId))) return res.status(403).json({ message: 'Case access denied. Only assigned Testers can record scenario results.' });
    const statusRows = await query('SELECT sm.name AS status FROM test_cases tc JOIN status_master sm ON sm.id=tc.status_id WHERE tc.id=?', [caseId]);
    if (statusRows[0]?.status === 'Closed') return res.status(403).json({ message: 'This test case is Closed. Ask the Project Creator to reopen it before updating scenario results.' });
    const scenario = await query('SELECT id FROM test_case_scenarios WHERE id=? AND test_case_id=?', [scenarioId, caseId]);
    if (!scenario.length) return res.status(404).json({ message: 'Scenario step not found.' });
    const result = String(req.body?.result || 'Pending').trim();
    if (!['OK','Not OK','Pending'].includes(result)) return res.status(400).json({ message: 'Result must be OK, Not OK, or Pending.' });
    const notes = String(req.body?.notes || '').trim() || null;
    await query(`INSERT INTO test_case_scenario_results(scenario_id,tester_id,result,notes)
      VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE result=VALUES(result),notes=VALUES(notes),updated_at=CURRENT_TIMESTAMP`, [scenarioId, req.user.id, result, notes]);

    // Close the case automatically only after every scenario is OK for every assigned Tester.
    const caseRows = await query('SELECT project_id,assigned_tester_id FROM test_cases WHERE id=?', [caseId]);
    const assignedRows = await query(`SELECT user_id FROM test_case_assignments WHERE test_case_id=? AND assignment_type='TESTER'`, [caseId]);
    const testerIds = [...new Set([...assignedRows.map(r => Number(r.user_id)), ...(caseRows[0]?.assigned_tester_id ? [Number(caseRows[0].assigned_tester_id)] : [])])];
    if (!testerIds.length) testerIds.push(Number(req.user.id));
    const scenarioRows = await query('SELECT id FROM test_case_scenarios WHERE test_case_id=?', [caseId]);
    let allAssignedTestersPassed = scenarioRows.length > 0;
    for (const testerId of testerIds) {
      const testerSummary = await query(`SELECT COUNT(*) AS total_steps,
          SUM(CASE WHEN sr.result='OK' THEN 1 ELSE 0 END) AS ok_steps
        FROM test_case_scenarios sc
        LEFT JOIN test_case_scenario_results sr ON sr.scenario_id=sc.id AND sr.tester_id=?
        WHERE sc.test_case_id=?`, [testerId, caseId]);
      const total = Number(testerSummary[0]?.total_steps || 0);
      const ok = Number(testerSummary[0]?.ok_steps || 0);
      if (!total || ok !== total) { allAssignedTestersPassed = false; break; }
    }
    const allResults = await query(`SELECT sr.result FROM test_case_scenarios sc
      LEFT JOIN test_case_scenario_results sr ON sr.scenario_id=sc.id
      WHERE sc.test_case_id=?`, [caseId]);
    const anyNotOk = allResults.some(r => r.result === 'Not OK');
    if (allAssignedTestersPassed) {
      await query(`UPDATE test_cases SET result_id=(SELECT id FROM result_master WHERE name='Tested' LIMIT 1),
        date_tested=CURDATE(), status_id=(SELECT id FROM status_master WHERE name='Closed' LIMIT 1) WHERE id=?`, [caseId]);
      await logAction(req.user.id, caseRows[0]?.project_id, caseId, 'TEST_CASE_AUTO_CLOSED', { reason: 'All scenario steps are OK for all assigned Testers.' });
    } else {
      const derivedResult = anyNotOk ? 'Fail' : 'Pending';
      await query(`UPDATE test_cases SET result_id=(SELECT id FROM result_master WHERE name=? LIMIT 1),
        status_id=(SELECT id FROM status_master WHERE name='Open' LIMIT 1) WHERE id=?`, [derivedResult, caseId]);
    }
    await logAction(req.user.id, caseRows[0]?.project_id, caseId, 'SCENARIO_RESULT_UPDATED', { scenarioId, result, autoClosed: allAssignedTestersPassed });
    res.json({ message: allAssignedTestersPassed ? 'All assigned Testers marked every scenario OK. Result set to Tested and status Closed automatically.' : `Scenario result saved. Overall result: ${anyNotOk ? 'Fail' : 'Pending'}. Test case remains Open.`, auto_closed: allAssignedTestersPassed });
  } catch (e) { next(e); }
});

app.get('/api/cases/:id/attempts', async (req, res, next) => {
  try {
    if (!(await canAccessCase(req.user, req.params.id))) return res.status(403).json({ message: 'Case access denied.' });
    res.json(await query(`SELECT a.*, r.name AS result, u.name AS tester_name FROM test_attempts a JOIN result_master r ON r.id=a.result_id JOIN users u ON u.id=a.tested_by WHERE a.test_case_id=? ORDER BY a.attempt_no DESC`, [req.params.id]));
  } catch (e) { next(e); }
});
app.post('/api/cases/:id/attempts', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!(await canAccessCase(req.user, id))) return res.status(403).json({ message: 'Case access denied.' });
    if (![PI, TESTER].includes(req.user.role)) return res.status(403).json({ message: 'Only a Tester can record a test attempt.' });
    const { result_id, findings = '' } = req.body || {};
    const resultRows = await query('SELECT name FROM result_master WHERE id=?', [result_id]);
    if (!resultRows[0] || !['Pass','Fail'].includes(resultRows[0].name)) return res.status(400).json({ message: 'Test attempt result must be Pass or Fail.' });
    const previous = await query('SELECT COALESCE(MAX(attempt_no),0) AS n FROM test_attempts WHERE test_case_id=?', [id]);
    const attemptNo = Number(previous[0].n) + 1;
    await query('INSERT INTO test_attempts(test_case_id,attempt_no,result_id,findings,tested_by) VALUES(?,?,?,?,?)',
      [id, attemptNo, result_id, findings, req.user.id]);
    await query("UPDATE test_cases SET result_id=?,findings=?,date_tested=CURDATE(),status_id=(SELECT id FROM status_master WHERE name='Open' LIMIT 1) WHERE id=?",
      [result_id, findings, id]);
    await logAction(req.user.id, null, id, 'TEST_ATTEMPT_RECORDED', { attemptNo, result: resultRows[0].name });
    res.status(201).json({ message: `Test attempt ${attemptNo} recorded.`, attempt_no: attemptNo });
  } catch (e) { next(e); }
});

app.get('/api/cases/:id/comments', async (req, res, next) => {
  try {
    if (!(await canAccessCase(req.user, req.params.id))) return res.status(403).json({ message: 'Case access denied.' });
    const comments = await query(`SELECT c.*,u.name AS user_name,u.role FROM comments c JOIN users u ON u.id=c.user_id WHERE c.test_case_id=? ORDER BY c.created_at`, [req.params.id]);
    const attachments = await query('SELECT id,comment_id,original_name,stored_name,size_bytes FROM attachments WHERE test_case_id=? AND comment_id IS NOT NULL', [req.params.id]);
    const map = new Map(comments.map(c => [Number(c.id), { ...c, replies: [], attachments: attachments.filter(a => Number(a.comment_id) === Number(c.id)) }]));
    const roots = [];
    for (const comment of map.values()) {
      if (comment.parent_id && map.has(Number(comment.parent_id))) map.get(Number(comment.parent_id)).replies.push(comment);
      else roots.push(comment);
    }
    res.json(roots);
  } catch (e) { next(e); }
});
app.post('/api/cases/:id/comments', upload.array('images', 5), async (req, res, next) => {
  const saved = [];
  try {
    const id = Number(req.params.id);
    if (!(await canAccessCase(req.user, id))) return res.status(403).json({ message: 'Case access denied.' });
    const body = String(req.body.body || '').trim();
    const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
    if (!body) return res.status(400).json({ message: 'Comment text is required.' });
    if (parentId) {
      const parent = await query('SELECT id FROM comments WHERE id=? AND test_case_id=?', [parentId, id]);
      if (!parent.length) return res.status(400).json({ message: 'Reply parent is invalid.' });
    }
    const caseRows = await query('SELECT id, project_id, module FROM test_cases WHERE id=?', [id]);
    const caseInfo = caseRows[0];
    const result = await query('INSERT INTO comments(test_case_id,user_id,parent_id,body) VALUES(?,?,?,?)', [id, req.user.id, parentId, body]);
    for (const file of (req.files || [])) {
      const img = await storeCompressedImage(file);
      saved.push(img.storedName);
      await query('INSERT INTO attachments(test_case_id,comment_id,uploaded_by,original_name,stored_name,size_bytes) VALUES(?,?,?,?,?,?)',
        [id, Number(result.insertId), req.user.id, img.originalName, img.storedName, img.sizeBytes]);
    }
    const assignedUsers = await query(`SELECT user_id FROM test_case_assignments WHERE test_case_id=?
      UNION SELECT assigned_tester_id AS user_id FROM test_cases WHERE id=? AND assigned_tester_id IS NOT NULL
      UNION SELECT assigned_tech_id AS user_id FROM test_cases WHERE id=? AND assigned_tech_id IS NOT NULL`, [id, id, id]);
    const recipientIds = assignedUsers.map(row => Number(row.user_id));
    if (parentId) {
      const parentRows = await query('SELECT user_id FROM comments WHERE id=? AND test_case_id=?', [parentId, id]);
      if (parentRows.length) recipientIds.push(Number(parentRows[0].user_id));
    }
    const caseLabel = `${caseInfo?.module || 'Test case'} (TC-${String(id).padStart(4, '0')})`;
    const isReply = Boolean(parentId);
    await notifyUsers(recipientIds, req.user.id, caseInfo?.project_id, id,
      isReply ? 'COMMENT_REPLY' : 'COMMENT_ADDED',
      isReply ? `New reply on a comment in ${caseLabel}.` : `New comment on ${caseLabel}.`);
    await logAction(req.user.id, caseInfo?.project_id || null, id, 'COMMENT_ADDED', { commentId: Number(result.insertId), parentId });
    res.status(201).json({ id: Number(result.insertId), message: isReply ? 'Reply posted.' : 'Comment posted.' });
  } catch (e) {
    for (const name of saved) await fs.unlink(path.join(uploadDir, name)).catch(() => {});
    next(e);
  }
});

app.post('/api/cases/:id/attachments', upload.array('images', 5), async (req, res, next) => {
  const saved = [];
  try {
    const id = Number(req.params.id);
    if (!(await canAccessCase(req.user, id))) return res.status(403).json({ message: 'Case access denied.' });
    const kind = req.body.kind === 'tech_comment' ? 'tech_comment' : 'findings';
    if (kind === 'findings' && ![PI, TESTER].includes(req.user.role)) return res.status(403).json({ message: 'Only Tester can upload findings evidence.' });
    if (kind === 'tech_comment' && ![PI, DEV].includes(req.user.role)) return res.status(403).json({ message: 'Only Tech/Dev can upload technical evidence.' });
    for (const file of (req.files || [])) {
      const img = await storeCompressedImage(file);
      saved.push(img.storedName);
      await query('INSERT INTO attachments(test_case_id,uploaded_by,original_name,stored_name,size_bytes) VALUES(?,?,?,?,?)',
        [id, req.user.id, img.originalName, img.storedName, img.sizeBytes]);
    }
    res.status(201).json({ message: `${saved.length} image(s) uploaded and compressed.` });
  } catch (e) {
    for (const name of saved) await fs.unlink(path.join(uploadDir, name)).catch(() => {});
    next(e);
  }
});
app.get('/api/cases/:id/attachments', async (req, res, next) => {
  try {
    if (!(await canAccessCase(req.user, req.params.id))) return res.status(403).json({ message: 'Case access denied.' });
    res.json(await query('SELECT id,comment_id,attempt_id,uploaded_by,original_name,stored_name,size_bytes,created_at FROM attachments WHERE test_case_id=? ORDER BY created_at DESC', [req.params.id]));
  } catch (e) { next(e); }
});

app.get('/api/dashboard', async (req, res, next) => {
  try {
    let projectFilter = '';
    const params = [];
    if (req.user.role !== PI) {
      projectFilter = ' AND tc.project_id IN (SELECT project_id FROM project_assignments WHERE user_id=?)';
      params.push(req.user.id);
    }
    const rows = await query(`SELECT r.name AS result, COUNT(*) AS total FROM test_cases tc LEFT JOIN result_master r ON r.id=tc.result_id WHERE 1=1${projectFilter} GROUP BY r.name`, params);
    const statusRows = await query(`SELECT s.name AS status,COUNT(*) AS total FROM test_cases tc JOIN status_master s ON s.id=tc.status_id WHERE 1=1${projectFilter} GROUP BY s.name`, params);
    const severityRows = await query(`SELECT sev.name AS severity,COUNT(*) AS total FROM test_cases tc JOIN severity_master sev ON sev.id=tc.severity_id WHERE 1=1${projectFilter} GROUP BY sev.name`, params);
    const projectRows = await query(`SELECT p.id,p.name,COUNT(tc.id) AS total,
      SUM(CASE WHEN r.name='Pass' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN r.name='Fail' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN r.name='For Review' THEN 1 ELSE 0 END) AS review
      FROM projects p LEFT JOIN test_cases tc ON tc.project_id=p.id LEFT JOIN result_master r ON r.id=tc.result_id
      WHERE 1=1 ${req.user.role === PI ? '' : 'AND p.id IN (SELECT project_id FROM project_assignments WHERE user_id=?)'}
      GROUP BY p.id,p.name ORDER BY p.name`, req.user.role === PI ? [] : [req.user.id]);
    res.json({ results: rows, statuses: statusRows, severities: severityRows, projects: projectRows });
  } catch (e) { next(e); }
});

app.get('/api/activity', async (req, res, next) => {
  try {
    const rows = await query(`SELECT al.*,u.name AS user_name,p.name AS project_name FROM activity_logs al JOIN users u ON u.id=al.user_id LEFT JOIN projects p ON p.id=al.project_id
      WHERE ${req.user.role === PI ? '1=1' : 'al.project_id IN (SELECT project_id FROM project_assignments WHERE user_id=?) OR al.test_case_id IN (SELECT tc.id FROM test_cases tc JOIN project_assignments pa ON pa.project_id=tc.project_id WHERE pa.user_id=?)'}
      ORDER BY al.created_at DESC LIMIT 50`, req.user.role === PI ? [] : [req.user.id, req.user.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That value already exists.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Each image must be 12 MB or smaller before compression.' });
  if (err.message?.includes('Only JPG')) return res.status(400).json({ message: err.message });
  res.status(500).json({ message: 'Unexpected server error. Check the API terminal for details.' });
});

app.listen(PORT, () => console.log(`UAT Monitoring API listening on http://localhost:${PORT}`));
