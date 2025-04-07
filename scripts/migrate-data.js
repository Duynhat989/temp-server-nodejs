// Data migration script from file-based storage to MySQL
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Import database
const { pool, initDatabase } = require('../config/database');

// Data paths for file-based system
const DATA_DIR = path.join(__dirname, '..', 'data');
const DOMAINS_FILE = path.join(DATA_DIR, 'domains.json');
const EMAILS_FILE = path.join(DATA_DIR, 'emails.json');
const MESSAGES_DIR = path.join(DATA_DIR, 'messages');

// Main migration function
async function migrateData() {
  try {
    console.log('Starting data migration from files to MySQL...');
    
    // Initialize database first
    await initDatabase();
    console.log('Database initialized');
    
    // Check if files exist
    if (!fs.existsSync(DOMAINS_FILE) || !fs.existsSync(EMAILS_FILE)) {
      console.log('No file data found to migrate');
      return;
    }
    
    // Get database connection
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // 1. Migrate domains
      console.log('Migrating domains...');
      const domainsData = JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
      
      // Map of old domain IDs to new UUIDs
      const domainIdMap = new Map();
      
      for (const domain of domainsData.domains) {
        const newId = uuidv4();
        domainIdMap.set(domain.id, newId);
        
        // Insert domain
        await connection.query(
          'INSERT INTO domains (id, name, created_at) VALUES (?, ?, ?)',
          [newId, domain.name, domain.createdAt || new Date().toISOString()]
        );
        
        console.log(`Migrated domain: ${domain.name}`);
      }
      
      // 2. Migrate domain configurations
      console.log('Migrating domain configurations...');
      const DOMAIN_CONFIG_DIR = path.join(__dirname, '..', 'config');
      const DOMAIN_CONFIG_FILE = path.join(DOMAIN_CONFIG_DIR, 'domains-config.json');
      
      if (fs.existsSync(DOMAIN_CONFIG_FILE)) {
        const domainConfigs = JSON.parse(fs.readFileSync(DOMAIN_CONFIG_FILE, 'utf8'));
        
        for (const config of domainConfigs.domains) {
          // Insert domain config
          await connection.query(`
            INSERT INTO domain_configs (
              id, domain_name, active, dkim_selector, dkim_public_key,
              dkim_private_key, dkim_txt_record, spf_record,
              dkim_verified, spf_verified, mx_verified, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            uuidv4(),
            config.domainName,
            config.active || false,
            config.dkimSelector || '',
            config.dkimPublicKey || '',
            config.dkimPrivateKey || '',
            config.dkimTxtRecord || '',
            config.spfRecord || '',
            config.dkimVerified || false,
            config.spfVerified || false,
            config.mxVerified || false,
            config.createdAt || new Date().toISOString()
          ]);
          
          console.log(`Migrated domain config: ${config.domainName}`);
        }
      }
      
      // 3. Migrate emails
      console.log('Migrating emails...');
      const emailsData = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf8'));
      
      // Map of old email IDs to new UUIDs
      const emailIdMap = new Map();
      
      for (const email of emailsData.emails) {
        const newId = uuidv4();
        emailIdMap.set(email.id, newId);
        
        // Get domain from email address
        const domain = email.address.split('@')[1];
        
        // Get domain ID from our database
        const [domains] = await connection.query(
          'SELECT id FROM domains WHERE name = ?',
          [domain]
        );
        
        if (domains.length === 0) {
          console.warn(`Domain not found for email ${email.address}, skipping...`);
          continue;
        }
        
        const domainId = domains[0].id;
        
        // Insert email
        await connection.query(`
          INSERT INTO emails (id, address, password, name, domain_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          newId,
          email.address,
          email.password, // Note: Consider hashing passwords if they weren't already
          email.name || '',
          domainId,
          email.createdAt || new Date().toISOString()
        ]);
        
        console.log(`Migrated email: ${email.address}`);
      }
      
      // 4. Migrate messages
      console.log('Migrating messages...');
      if (fs.existsSync(MESSAGES_DIR)) {
        // Get all directories in messages dir (each dir is an email)
        const emailDirs = fs.readdirSync(MESSAGES_DIR).filter(dir => 
          fs.statSync(path.join(MESSAGES_DIR, dir)).isDirectory()
        );
        
        for (const emailDir of emailDirs) {
          const emailPath = path.join(MESSAGES_DIR, emailDir);
          const messageFiles = fs.readdirSync(emailPath)
            .filter(file => file.endsWith('.json'));
          
          for (const messageFile of messageFiles) {
            const messagePath = path.join(emailPath, messageFile);
            const messageData = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
            
            // Insert message
            await connection.query(`
              INSERT INTO messages (
                id, message_id, from_email, to_email, subject,
                text_content, html_content, sent, read, created_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              messageData.id || uuidv4(),
              messageData.messageId || '',
              messageData.from || '',
              messageData.to || emailDir,
              messageData.subject || '',
              messageData.text || '',
              messageData.html || '',
              messageData.sent || false,
              messageData.read || false,
              messageData.date || new Date().toISOString()
            ]);
          }
          
          console.log(`Migrated messages for: ${emailDir}`);
        }
      }
      
      // Commit transaction
      await connection.commit();
      console.log('Migration completed successfully!');
    } catch (error) {
      await connection.rollback();
      console.error('Migration failed:', error);
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the migration
migrateData().then(() => {
  console.log('Migration script finished');
  process.exit(0);
});