// Email configuration model for database operations
const { pool } = require('../config/database');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const net = require('net');

/**
 * Get current email configuration
 * @returns {Promise<Object>} Email configuration object
 */
async function getEmailConfig() {
  try {
    const [rows] = await pool.query(
      'SELECT config_value FROM email_configs WHERE config_key = ?',
      ['default_config']
    );
    
    if (rows.length === 0) {
      throw new Error('Default email configuration not found');
    }
    
    return JSON.parse(rows[0].config_value);
  } catch (error) {
    console.error('Error getting email config:', error.message);
    throw error;
  }
}

/**
 * Update email configuration
 * @param {Object} newConfig - New configuration values
 * @returns {Promise<Object>} Updated email configuration object
 */
async function updateEmailConfig(newConfig) {
  try {
    // Get current config to merge with new config
    const currentConfig = await getEmailConfig();
    
    // Deep merge current and new configs
    const mergedConfig = deepMerge(currentConfig, newConfig);
    
    // Update in database
    await pool.query(
      'UPDATE email_configs SET config_value = ? WHERE config_key = ?',
      [JSON.stringify(mergedConfig), 'default_config']
    );
    
    return mergedConfig;
  } catch (error) {
    console.error('Error updating email config:', error.message);
    throw error;
  }
}

/**
 * Helper function to deep merge objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
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

/**
 * Helper function to check if value is an object
 * @param {*} item - Value to check
 * @returns {boolean} True if item is an object
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Check DNS configuration for a domain
 * @param {string} domain - Domain name
 * @returns {Promise<Object>} DNS configuration status
 */
async function checkDNSConfiguration(domain) {
  try {
    // In a production app, this would make actual DNS lookups
    // For now, we'll simulate the check with mock data
    
    // Simulate a network delay
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
}

/**
 * Check if port 25 is open locally
 * @returns {Promise<Object>} Port check result
 */
async function checkPort25IsOpen() {
  try {
    // In a production app, you'd actually check the port
    // Here's a simple implementation that tries to create a server
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', () => {
        resolve({ open: false, details: 'Port 25 is in use or requires elevated privileges' });
      });
      
      server.once('listening', () => {
        server.close();
        resolve({ open: true, details: 'Port 25 is available' });
      });
      
      server.listen(25);
    });
  } catch (error) {
    return { open: false, details: error.message };
  }
}

/**
 * Check if a port is open from the internet
 * @param {number} port - Port to check
 * @returns {Promise<Object>} Port check result
 */
async function checkPortIsOpenFromInternet(port) {
  // In a production app, you'd use an external service or API
  // For now, return a simulated result
  return { 
    open: false, 
    details: 'Cannot verify from within the application. Use an external port checking service.' 
  };
}

/**
 * Configure Postfix for a domain
 * @param {string} domain - Domain name
 * @returns {Promise<Object>} Postfix configuration
 */
async function configurePostfix(domain) {
  try {
    // In a production app, this would generate actual Postfix configuration
    // For now, return mock data
    return {
      success: true,
      files: {
        'main.cf': `# Postfix configuration for ${domain}\nmyhostname = mail.${domain}\nmydomain = ${domain}\n...`,
        'master.cf': '# Postfix master process configuration\nsmtp      inet  n       -       y       -       -       smtpd\n...'
      }
    };
  } catch (error) {
    console.error('Error configuring Postfix:', error.message);
    throw error;
  }
}

/**
 * Apply Postfix configuration
 * @param {string} domain - Domain name
 * @param {boolean} forceRestart - Whether to force restart Postfix
 * @returns {Promise<Object>} Application result
 */
async function applyPostfixConfig(domain, forceRestart = false) {
  try {
    // In a production app, this would actually apply Postfix configuration
    // For example:
    // await execPromise('sudo postfix reload');
    
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      message: `Postfix configuration for ${domain} applied successfully${forceRestart ? ' and service restarted' : ''}`
    };
  } catch (error) {
    console.error('Error applying Postfix configuration:', error.message);
    throw error;
  }
}

/**
 * Generate inbound email setup instructions
 * @returns {Promise<Object>} Setup instructions
 */
async function generateInboundEmailInstructions() {
  try {
    const port25Check = await checkPort25IsOpen();
    const internetCheck = await checkPortIsOpenFromInternet(25);
    
    return {
      steps: [
        'Ensure port 25 is open on your server',
        'Configure DNS MX records to point to your server',
        'Configure reverse DNS (PTR) for your server IP',
        'Set up SPF, DKIM, and DMARC records',
        'Configure your firewall to allow SMTP traffic',
        'Test your setup with external email services'
      ],
      portChecks: {
        local: port25Check,
        internet: internetCheck
      }
    };
  } catch (error) {
    console.error('Error generating inbound email instructions:', error.message);
    throw error;
  }
}

module.exports = {
  getEmailConfig,
  updateEmailConfig,
  checkDNSConfiguration,
  checkPort25IsOpen,
  checkPortIsOpenFromInternet,
  configurePostfix,
  applyPostfixConfig,
  generateInboundEmailInstructions
};