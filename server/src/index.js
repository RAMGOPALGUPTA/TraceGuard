import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pool from './db.js';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});


const AUTH_SECRET = process.env.AUTH_SECRET || 'traceguard-local-development-secret-change-before-deploy';
const makeToken = user => {
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};
const authenticate = (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
    if (!token || !token.includes('.')) return res.status(401).json({ error: 'Sign in to access TraceGuard.' });
    const [payload, signature] = token.split('.');
    const expected = createHmac('sha256', AUTH_SECRET).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'Invalid session. Please sign in again.' });
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!user.id || !user.exp || user.exp < Date.now()) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Invalid session. Please sign in again.' }); }
};

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 190) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 10 || password.length > 200) return res.status(400).json({ error: 'Password must be between 10 and 200 characters.' });
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(password, salt, 64).toString('hex');
    const [result] = await pool.execute('INSERT INTO users (name,email,password_hash,password_salt) VALUES (?,?,?,?)', [name,email,passwordHash,salt]);
    const user = { id: result.insertId, name, email };
    res.status(201).json({ token: makeToken(user), user });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists.' });
    if (e.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ error: 'Authentication database is not installed yet. Run database/auth-migration.sql.' });
    next(e);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [[user]] = await pool.execute('SELECT id,name,email,password_hash,password_salt FROM users WHERE email=? LIMIT 1', [email]);
    if (!user) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const actual = scryptSync(password, user.password_salt, 64);
    const expected = Buffer.from(user.password_hash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.json({ token: makeToken(user), user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ error: 'Authentication database is not installed yet. Run database/auth-migration.sql.' });
    next(e);
  }
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email } }));
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
  return authenticate(req, res, next);
});

app.get('/api/dashboard', async (_req,res,next) => {
  try {
    const [[p]] = await pool.query('SELECT COUNT(*) total FROM products');
    const [[b]] = await pool.query("SELECT COUNT(*) total, SUM(status='Recalled') recalled, SUM(status='Active' AND expires_on >= CURDATE()) active FROM batches");
    const [[s]] = await pool.query("SELECT COUNT(*) total, SUM(status='In Transit') inTransit, SUM(status='Delivered') delivered FROM shipments");
    const [[l]] = await pool.query('SELECT COUNT(*) total FROM locations');
    const [recent] = await pool.query(`SELECT s.shipment_code, s.status, s.quantity, s.dispatched_at, b.batch_code, src.name source_name, dst.name destination_name
      FROM shipments s JOIN batches b ON b.id=s.batch_id JOIN locations src ON src.id=s.source_location_id
      JOIN locations dst ON dst.id=s.destination_location_id ORDER BY s.created_at DESC LIMIT 6`);
    const [alerts] = await pool.query(`SELECT r.id,r.recall_code,r.reason,r.severity,r.status,r.initiated_at,b.batch_code,p.name product_name
      FROM recalls r JOIN batches b ON b.id=r.batch_id JOIN products p ON p.id=b.product_id
      ORDER BY r.initiated_at DESC LIMIT 5`);
    const [byStatus] = await pool.query('SELECT status,COUNT(*) count FROM shipments GROUP BY status');
    res.json({ products:p.total, batches:b.total, activeBatches:Number(b.active||0), recalledBatches:Number(b.recalled||0), shipments:s.total, inTransit:Number(s.inTransit||0), delivered:Number(s.delivered||0), locations:l.total, recent, alerts, byStatus });
  } catch(e) { next(e); }
});

app.get('/api/products', async (req,res,next) => {
  try {
    const [rows] = await pool.query(`SELECT p.*,COUNT(DISTINCT b.id) batch_count FROM products p LEFT JOIN batches b ON b.product_id=p.id
      WHERE (?='' OR p.name LIKE CONCAT('%',?,'%') OR p.sku LIKE CONCAT('%',?,'%'))
      GROUP BY p.id ORDER BY p.created_at DESC`, [req.query.q||'',req.query.q||'',req.query.q||'']);
    res.json(rows);
  } catch(e) { next(e); }
});
app.post('/api/products', async (req,res,next) => {
  try {
    const {sku,name,category,description=''}=req.body;
    if (!sku||!name||!category) return res.status(400).json({error:'SKU, name and category are required.'});
    const [r]=await pool.execute('INSERT INTO products (sku,name,category,description) VALUES (?,?,?,?)',[sku.trim(),name.trim(),category.trim(),description]);
    await pool.execute("INSERT INTO audit_logs(action,entity_type,entity_id,description) VALUES('PRODUCT_CREATED','Product',?,?)",[r.insertId,`Product ${sku} created.`]);
    res.status(201).json({id:r.insertId,sku,name,category,description});
  } catch(e) { next(e); }
});

app.get('/api/locations', async (_req,res,next) => {
  try { const [rows]=await pool.query('SELECT * FROM locations ORDER BY type,name'); res.json(rows); } catch(e){next(e);}
});
app.post('/api/locations', async (req,res,next) => {
  try {
    const {code,name,type,city,state,contact_email=''}=req.body;
    if(!code||!name||!['Manufacturer','Warehouse','Distributor','Retailer'].includes(type)||!city||!state) return res.status(400).json({error:'Complete all required location fields.'});
    const [r]=await pool.execute('INSERT INTO locations(code,name,type,city,state,contact_email) VALUES(?,?,?,?,?,?)',[code,name,type,city,state,contact_email]);
    await pool.execute("INSERT INTO audit_logs(action,entity_type,entity_id,description) VALUES('LOCATION_CREATED','Location',?,?)",[r.insertId,`Location ${name} created.`]);
    res.status(201).json({id:r.insertId,...req.body});
  }catch(e){next(e);}
});

app.get('/api/batches', async (_req,res,next) => {
  try {
    const [rows]=await pool.query(`SELECT b.*,p.name product_name,p.sku,m.name manufacturer_name,
      CASE WHEN b.status='Recalled' THEN 'Recalled' WHEN b.expires_on < CURDATE() THEN 'Expired' ELSE b.status END computed_status
      FROM batches b JOIN products p ON p.id=b.product_id JOIN locations m ON m.id=b.manufacturer_id ORDER BY b.created_at DESC`);
    res.json(rows);
  }catch(e){next(e);}
});
app.post('/api/batches', async (req,res,next) => {
  try {
    const {batch_code,product_id,manufacturer_id,manufactured_on,expires_on,produced_quantity}=req.body;
    if(!batch_code||!product_id||!manufacturer_id||!manufactured_on||!expires_on||!Number.isInteger(Number(produced_quantity))||Number(produced_quantity)<=0||expires_on<=manufactured_on) return res.status(400).json({error:'Provide valid batch details, dates and a positive integer quantity.'});
    const [r]=await pool.execute('INSERT INTO batches(batch_code,product_id,manufacturer_id,manufactured_on,expires_on,produced_quantity) VALUES(?,?,?,?,?,?)',[batch_code,product_id,manufacturer_id,manufactured_on,expires_on,produced_quantity]);
    await pool.execute("INSERT INTO audit_logs(action,entity_type,entity_id,description) VALUES('BATCH_CREATED','Batch',?,?)",[r.insertId,`Batch ${batch_code} created.`]);
    res.status(201).json({id:r.insertId,...req.body});
  }catch(e){next(e);}
});

app.get('/api/shipments', async (_req,res,next) => {
  try{
    const [rows]=await pool.query(`SELECT s.*,b.batch_code,p.name product_name,src.name source_name,dst.name destination_name
      FROM shipments s JOIN batches b ON b.id=s.batch_id JOIN products p ON p.id=b.product_id
      JOIN locations src ON src.id=s.source_location_id JOIN locations dst ON dst.id=s.destination_location_id
      ORDER BY s.dispatched_at DESC`);
    res.json(rows);
  }catch(e){next(e);}
});
app.post('/api/shipments', async (req,res,next) => {
  const conn=await pool.getConnection();
  try{
    const {shipment_code,batch_id,source_location_id,destination_location_id,quantity,dispatched_at,expected_at=null}=req.body;
    if(!shipment_code||!batch_id||!source_location_id||!destination_location_id||source_location_id===destination_location_id||!Number.isInteger(Number(quantity))||Number(quantity)<=0||!dispatched_at) {conn.release();return res.status(400).json({error:'Provide valid shipment details and a positive quantity.'});}
    await conn.beginTransaction();
    const [[batch]]=await conn.execute('SELECT status,expires_on FROM batches WHERE id=? FOR UPDATE',[batch_id]);
    if(!batch){await conn.rollback();return res.status(404).json({error:'Batch not found.'});}
    if(batch.status==='Recalled'||batch.expires_on < new Date().toISOString().slice(0,10)){await conn.rollback();return res.status(409).json({error:'Expired or recalled batches cannot be dispatched.'});}
    const [r]=await conn.execute('INSERT INTO shipments(shipment_code,batch_id,source_location_id,destination_location_id,quantity,dispatched_at,expected_at) VALUES(?,?,?,?,?,?,?)',[shipment_code,batch_id,source_location_id,destination_location_id,quantity,dispatched_at,expected_at]);
    await conn.execute("INSERT INTO audit_logs(action,entity_type,entity_id,description) VALUES('SHIPMENT_CREATED','Shipment',?,?)",[r.insertId,`Shipment ${shipment_code} created.`]);
    await conn.commit();
    res.status(201).json({id:r.insertId,...req.body});
  }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
app.patch('/api/shipments/:id/status', async (req,res,next)=>{
  try{
    const [[current]] = await pool.query('SELECT s.id,b.status batch_status FROM shipments s JOIN batches b ON b.id=s.batch_id WHERE s.id=?',[req.params.id]);
    if(!current) return res.status(404).json({error:'Shipment not found.'});
    if(current.batch_status==='Recalled' && req.body.status!=='Cancelled') return res.status(409).json({error:'Shipment belongs to a recalled batch. Only cancellation is allowed.'});
    const {status}=req.body;
    if(!['Dispatched','In Transit','Delivered','Cancelled'].includes(status)) return res.status(400).json({error:'Invalid shipment status.'});
    const [r]=await pool.execute("UPDATE shipments SET status=?,delivered_at=IF(?='Delivered',NOW(),delivered_at) WHERE id=?",[status,status,req.params.id]);
    if(!r.affectedRows) return res.status(404).json({error:'Shipment not found.'});
    await pool.execute("INSERT INTO audit_logs(action,entity_type,entity_id,description) VALUES('SHIPMENT_STATUS_UPDATED','Shipment',?,?)",[req.params.id,`Shipment status changed to ${status}.`]);
    res.json({success:true});
  }catch(e){next(e);}
});

app.get('/api/recalls', async (_req,res,next)=>{
  try{const [rows]=await pool.query(`SELECT r.*,b.batch_code,p.name product_name FROM recalls r JOIN batches b ON b.id=r.batch_id JOIN products p ON p.id=b.product_id ORDER BY r.initiated_at DESC`);res.json(rows);}catch(e){next(e);}
});
app.post('/api/recalls', async (req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    const {batch_id,reason,severity='High'}=req.body;
    if(!batch_id||!reason?.trim()||!['Low','Medium','High','Critical'].includes(severity)){conn.release();return res.status(400).json({error:'Select a batch, provide a reason and valid severity.'});}
    await conn.beginTransaction();
    const [[batch]]=await conn.execute('SELECT id,batch_code,status FROM batches WHERE id=? FOR UPDATE',[batch_id]);
    if(!batch){await conn.rollback();return res.status(404).json({error:'Batch not found.'});}
    if(batch.status==='Recalled'){await conn.rollback();return res.status(409).json({error:'This batch is already recalled.'});}
    const recallCode=`TG-RCL-${Date.now().toString().slice(-8)}`;
    const [r]=await conn.execute('INSERT INTO recalls(recall_code,batch_id,reason,severity) VALUES(?,?,?,?)',[recallCode,batch_id,reason.trim(),severity]);
    await conn.execute("UPDATE batches SET status='Recalled' WHERE id=?",[batch_id]);
    await conn.execute("INSERT INTO audit_logs(action,entity_type,entity_id,description) VALUES('RECALL_INITIATED','Recall',?,?)",[r.insertId,`Recall ${recallCode} initiated for ${batch.batch_code}.`]);
    await conn.commit();
    res.status(201).json({id:r.insertId,recall_code:recallCode,batch_code:batch.batch_code});
  }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});
app.get('/api/recalls/:id/impact', async (req,res,next)=>{
  try{
    const [[recall]]=await pool.query(`SELECT r.*,b.batch_code,p.name product_name FROM recalls r JOIN batches b ON b.id=r.batch_id JOIN products p ON p.id=b.product_id WHERE r.id=?`,[req.params.id]);
    if(!recall) return res.status(404).json({error:'Recall not found.'});
    const [shipments]=await pool.query(`WITH RECURSIVE downstream AS (
      SELECT s.id,s.batch_id,s.source_location_id,s.destination_location_id,s.quantity,s.status,s.shipment_code,1 depth
      FROM shipments s WHERE s.batch_id=? 
      UNION ALL
      SELECT s.id,s.batch_id,s.source_location_id,s.destination_location_id,s.quantity,s.status,s.shipment_code,d.depth+1
      FROM shipments s JOIN downstream d ON s.batch_id=d.batch_id AND s.source_location_id=d.destination_location_id
      WHERE d.depth<12 AND s.id<>d.id
    )
    SELECT DISTINCT d.*,src.name source_name,dst.name destination_name,dst.type destination_type,dst.city,dst.state
    FROM downstream d JOIN locations src ON src.id=d.source_location_id JOIN locations dst ON dst.id=d.destination_location_id ORDER BY d.depth,d.id`,[recall.batch_id]);
    const locations=[...new Map(shipments.map(s=>[s.destination_location_id,{id:s.destination_location_id,name:s.destination_name,type:s.destination_type,city:s.city,state:s.state}])).values()];
    res.json({recall,shipments,locations,shipmentCount:shipments.length,recipientCount:locations.length});
  }catch(e){next(e);}
});

app.get('/api/analytics', async (_req,res,next)=>{
  try{
    const [shipmentStatus]=await pool.query('SELECT status,COUNT(*) count,SUM(quantity) units FROM shipments GROUP BY status');
    const [categoryMix]=await pool.query('SELECT p.category,COUNT(DISTINCT p.id) products,COUNT(DISTINCT b.id) batches FROM products p LEFT JOIN batches b ON b.product_id=p.id GROUP BY p.category');
    const [locationFlow]=await pool.query(`SELECT l.id,l.name,l.type,COALESCE(SUM(CASE WHEN s.destination_location_id=l.id THEN s.quantity ELSE 0 END),0) received,
      COALESCE(SUM(CASE WHEN s.source_location_id=l.id THEN s.quantity ELSE 0 END),0) dispatched
      FROM locations l LEFT JOIN shipments s ON s.source_location_id=l.id OR s.destination_location_id=l.id GROUP BY l.id ORDER BY received DESC`);
    res.json({shipmentStatus,categoryMix,locationFlow});
  }catch(e){next(e);}
});
app.get('/api/audit-logs', async (_req,res,next)=>{
  try{const [rows]=await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');res.json(rows);}catch(e){next(e);}
});

app.use((err,_req,res,_next)=>{
  console.error(err);
  if(err.code==='ER_DUP_ENTRY') return res.status(409).json({error:'A record with that unique code already exists.'});
  if(err.code==='ER_NO_REFERENCED_ROW_2') return res.status(400).json({error:'Referenced product, batch or location does not exist.'});
  res.status(500).json({error:'Internal server error. Check the API logs.'});
});
const port=Number(process.env.PORT||4000);
app.listen(port,()=>console.log(`TraceGuard API listening on http://localhost:${port}`));
