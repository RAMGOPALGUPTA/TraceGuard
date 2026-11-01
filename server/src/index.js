import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pool from './db.js';
dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
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
