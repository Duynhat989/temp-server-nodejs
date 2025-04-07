// Email configuration model using Sequelize
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const net = require('net');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class EmailConfig extends Model {
  // Define model associations
  static associate() {
    // This model doesn't have any associations
  }
  
  // Get and parse config value
  getConfigValue() {
    return JSON.parse(this.configValue);
  }
  
  // Set config value from object
  setConfigFromObject(obj) {
    this.configValue = JSON.stringify(obj);
  }
}

// Initialize EmailConfig model
EmailConfig.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  configKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  configValue: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  }
}, {
  sequelize,
  modelName: 'email_config',
  timestamps: true,
  underscored: true
});

// Static methods
EmailConfig.getConfig = async function() {
  try {
    let config = await this.findOne({ where: { configKey: 'default_config' } });
    
    if (!config) {
      // Create default config if not exists
      const defaultConfig = {
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
      
      config = await this.create({
        configKey: 'default_config',
        configValue: defaultConfig
      });
    }
    
    return config.getConfigValue();
  } catch (error) {
    console.error('Error getting email config:', error);
    throw error;
  }
};

EmailConfig.updateConfig = async function(newConfig) {
  try {
    let config = await this.findOne({ where: { configKey: 'default_config' } });
    
    if (!config) {
      return this.getConfig(); // This will create default config
    }
    
    // Merge with existing config
    const currentConfig = config.getConfigValue();
    const mergedConfig = deepMerge(currentConfig, newConfig);
    
    // Update config
    await config.update({
      configValue: mergedConfig
    });
    
    return mergedConfig;
  } catch (error) {
    console.error('Error updating email config:', error);
    throw error;
  }
};

EmailConfig.checkPort25IsOpen = async function() {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      resolve({
        open: false,
        details: err.code === 'EADDRINUSE' 
          ? 'Port 25 is in use by another application'
          : err.code === 'EACCES'
            ? 'Permission denied to access port 25 (try running with elevated privileges)'
            : `Error checking port 25: ${err.message}`
      });
    });
    
    server.once('listening', () => {
      server.close();
      resolve({ open: true, details: 'Port 25 is available' });
    });
    
    server.listen(25);
  });
};

EmailConfig.checkDNSConfiguration = async function(domain) {
  try {
    // In a production app, this would make actual DNS lookups
    // For now, simulate the check
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      dkim: {
        configured: true,
        value: `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC5...`
      },
      spf: {
        configured: true,
        value: `v=spf1 ip4:127.0.0.1 -all`
      },
      mx: {
        configured: true,
        records: [{
          priority: 10,
          exchange: `mail.${domain}`
        }]
      }
    };
  } catch (error) {
    console.error('Error checking DNS configuration:', error);
    throw error;
  }
};

// Helper function to deep merge objects
function deepMerge(target, source) {
  const output = Object.assign({}, target);
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

// Helper function to check if value is an object
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

module.exports = EmailConfig;