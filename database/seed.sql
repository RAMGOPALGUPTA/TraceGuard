USE traceguard;
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE audit_logs;
TRUNCATE TABLE recalls;
TRUNCATE TABLE shipments;
TRUNCATE TABLE batches;
TRUNCATE TABLE locations;
TRUNCATE TABLE products;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO products (id,sku,name,category,description) VALUES
(1,'MED-AX14','Axiom Relief Tablets','Healthcare','Fictional demonstration product.'),
(2,'ELEC-NV22','NovaCharge Power Bank','Electronics','Fictional demonstration product.'),
(3,'FOOD-OR09','Orchard Oat Bites','Packaged Goods','Fictional demonstration product.'),
(4,'MED-CL31','ClearAir Syrup','Healthcare','Fictional demonstration product.');

INSERT INTO locations (id,code,name,type,city,state,contact_email) VALUES
(1,'MFG-ALPHA','Alpha Manufacturing','Manufacturer','Pune','Maharashtra','ops@alpha.demo'),
(2,'WH-NORTH','North Distribution Hub','Warehouse','Delhi','Delhi','north@traceguard.demo'),
(3,'DIST-CENTRAL','Central Logistics','Distributor','Jaipur','Rajasthan','central@traceguard.demo'),
(4,'RTL-01','Metro Care Store','Retailer','Jaipur','Rajasthan','metro@retail.demo'),
(5,'RTL-02','City Wellness Market','Retailer','Ajmer','Rajasthan','city@retail.demo'),
(6,'RTL-03','North Point Supplies','Retailer','Delhi','Delhi','northpoint@retail.demo'),
(7,'MFG-BETA','Beta Devices Plant','Manufacturer','Noida','Uttar Pradesh','beta@traceguard.demo'),
(8,'WH-WEST','West Storage Center','Warehouse','Ahmedabad','Gujarat','west@traceguard.demo'),
(9,'DIST-WEST','Westline Distribution','Distributor','Surat','Gujarat','westline@traceguard.demo');

INSERT INTO batches (id,batch_code,product_id,manufacturer_id,manufactured_on,expires_on,produced_quantity,status) VALUES
(1,'TG-BAT-104',1,1,'2026-08-01','2027-08-01',1200,'Active'),
(2,'TG-BAT-208',2,7,'2026-09-10','2029-09-10',800,'Active'),
(3,'TG-BAT-309',3,1,'2026-07-15','2027-01-15',1600,'Active'),
(4,'TG-BAT-411',4,1,'2025-01-01','2026-01-01',500,'Expired');

INSERT INTO shipments (id,shipment_code,batch_id,source_location_id,destination_location_id,quantity,dispatched_at,expected_at,delivered_at,status) VALUES
(1,'TG-SHP-1001',1,1,2,1000,'2026-10-10 08:30:00','2026-10-11 18:00:00','2026-10-11 14:20:00','Delivered'),
(2,'TG-SHP-1002',1,2,3,600,'2026-10-12 09:00:00','2026-10-13 18:00:00','2026-10-13 16:10:00','Delivered'),
(3,'TG-SHP-1003',1,3,4,200,'2026-10-14 10:00:00','2026-10-15 18:00:00',NULL,'In Transit'),
(4,'TG-SHP-1004',1,3,5,150,'2026-10-14 11:00:00','2026-10-15 18:00:00',NULL,'In Transit'),
(5,'TG-SHP-1005',1,2,6,100,'2026-10-14 12:00:00','2026-10-15 18:00:00',NULL,'Dispatched'),
(6,'TG-SHP-2001',2,7,8,700,'2026-10-18 08:00:00','2026-10-19 18:00:00','2026-10-19 14:00:00','Delivered'),
(7,'TG-SHP-2002',2,8,9,320,'2026-10-20 09:00:00','2026-10-21 18:00:00',NULL,'In Transit'),
(8,'TG-SHP-3001',3,1,2,900,'2026-10-17 08:00:00','2026-10-18 18:00:00','2026-10-18 12:00:00','Delivered');

INSERT INTO audit_logs (action,entity_type,entity_id,description) VALUES
('SYSTEM_SEED','System',NULL,'Demo dataset initialized.'),
('SHIPMENT_CREATED','Shipment',1,'Shipment TG-SHP-1001 recorded.'),
('SHIPMENT_CREATED','Shipment',2,'Shipment TG-SHP-1002 recorded.'),
('BATCH_CREATED','Batch',1,'Batch TG-BAT-104 registered.');
