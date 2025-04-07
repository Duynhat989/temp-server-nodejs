// Database configuration using Sequelize
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Create Sequelize instance
const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'email_server',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true, // Adds createdAt and updatedAt
    underscored: true, // Uses snake_case for column names
    freezeTableName: false, // Pluralizes table names
  }
});

// Test database connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

// Initialize all models and associations
async function initModels() {
  // Import models
  const Domain = require('../models/domain-model');
  const Email = require('../models/email-model');
  const Message = require('../models/message-model');
  const DomainConfig = require('../models/domain-config-model');
  const EmailConfig = require('../models/email-config-model');

  // Associate models
  Domain.associate({ Email, DomainConfig });
  Email.associate({ Domain, Message });
  Message.associate({ Email });
  DomainConfig.associate({ Domain });
  EmailConfig.associate();

  return { Domain, Email, Message, DomainConfig, EmailConfig };
}

// Initialize database and sync models
async function initDatabase() {
  try {
    // Import and setup models
    const models = await initModels();
    
    // Sync all models with database
    // In production, you would use 'alter: true' instead of 'force: true'
    // force: true will drop tables if they exist
    const syncOptions = {
      alter: process.env.NODE_ENV === 'development' && process.env.DB_RESET === 'true', 
      force: false
    };
    
    await sequelize.sync(syncOptions);
    console.log('Database synchronized');
    
    // Setup default data if needed
    await setupDefaultData(models);
    
    return models;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    throw error;
  }
}

// Setup default data for first-time setup
async function setupDefaultData(models) {
  const { EmailConfig } = models;
  
  try {
    // Check if default email config exists
    const configCount = await EmailConfig.count();
    
    if (configCount === 0) {
      // Create default email config
      await EmailConfig.create({
        configKey: 'default_config',
        configValue: {
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
        }
      });
      
      console.log('Default email configuration created');
    }
  } catch (error) {
    console.error('Error setting up default data:', error.message);
  }
}

module.exports = {
  sequelize,
  testConnection,
  initDatabase
};