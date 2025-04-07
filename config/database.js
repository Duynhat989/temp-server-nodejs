// Database configuration
const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'email_server',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connection established successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

// Initialize database - create tables if they don't exist
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create domains table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS domains (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create emails table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id VARCHAR(36) PRIMARY KEY,
        address VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        domain_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
      )
    `);
    
    // Create messages table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(36) PRIMARY KEY,
        message_id VARCHAR(255),
        from_email VARCHAR(255) NOT NULL,
        to_email VARCHAR(255) NOT NULL,
        subject TEXT,
        text_content LONGTEXT,
        html_content LONGTEXT,
        sent BOOLEAN DEFAULT FALSE,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create domain_configs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS domain_configs (
        id VARCHAR(36) PRIMARY KEY,
        domain_name VARCHAR(255) NOT NULL UNIQUE,
        active BOOLEAN DEFAULT FALSE,
        dkim_selector VARCHAR(255),
        dkim_public_key TEXT,
        dkim_private_key TEXT,
        dkim_txt_record TEXT,
        spf_record TEXT,
        dkim_verified BOOLEAN DEFAULT FALSE,
        spf_verified BOOLEAN DEFAULT FALSE,
        mx_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (domain_name) REFERENCES domains(name) ON DELETE CASCADE
      )
    `);
    
    // Create email_configs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS email_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        config_key VARCHAR(255) NOT NULL UNIQUE,
        config_value JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Insert default email config if not exists
    const [defaultConfig] = await connection.query(
      'SELECT * FROM email_configs WHERE config_key = ?', 
      ['default_config']
    );
    
    if (defaultConfig.length === 0) {
      const defaultEmailConfig = {
        inbound: {
          enabled: true,
          port: 25,
          hostname: 'localhost',
          requireAuth: false
        },
        outbound: {
          enabled: true,
          useRelay: false,
          relayHost: '',
          relayPort: 587,
          relayUsername: '',
          relayPassword: ''
        },
        limits: {
          maxMessageSize: 10 * 1024 * 1024, // 10MB
          maxRecipients: 50,
          rateLimit: 100 // per hour
        },
        security: {
          useTLS: true,
          requireTLS: false,
          useDKIM: true,
          useSPF: true
        }
      };
      
      await connection.query(
        'INSERT INTO email_configs (config_key, config_value) VALUES (?, ?)',
        ['default_config', JSON.stringify(defaultEmailConfig)]
      );
    }
    
    connection.release();
    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection,
  initDatabase
};