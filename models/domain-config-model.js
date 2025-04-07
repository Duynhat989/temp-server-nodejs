// Domain configuration model for database operations
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const crypto = require('crypto');

/**
 * Generate DKIM keys for a domain
 * @returns {Object} Object containing public and private keys
 */
function generateDKIMKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return {
    publicKey: publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, ''),
    privateKey
  };
}

/**
 * Generate TXT record for DKIM
 * @param {string} publicKey - DKIM public key
 * @returns {string} DKIM TXT record
 */
function generateDKIMTxtRecord(publicKey) {
  return `v=DKIM1; k=rsa; p=${publicKey}`;
}

/**
 * Get all domain configurations
 * @returns {Promise<Array>} Array of domain configuration objects
 */
async function getAllDomainConfigs() {
  try {
    const [rows] = await pool.query('SELECT * FROM domain_configs ORDER BY created_at DESC');
    return rows;
  } catch (error) {
    console.error('Error getting domain configs:', error.message);
    throw error;
  }
}

/**
 * Get domain configuration by domain name
 * @param {string} domainName - Domain name
 * @returns {Promise<Object>} Domain configuration object
 */
async function getDomainConfigByName(domainName) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM domain_configs WHERE domain_name = ?',
      [domainName]
    );
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting domain config for ${domainName}:`, error.message);
    throw error;
  }
}

/**
 * Create a domain configuration
 * @param {string} domainName - Domain name
 * @returns {Promise<Object>} Created domain configuration object
 */
async function createDomainConfig(domainName) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Check if config already exists
    const [existing] = await connection.query(
      'SELECT * FROM domain_configs WHERE domain_name = ?',
      [domainName]
    );
    
    if (existing.length > 0) {
      await connection.commit();
      return existing[0];
    }
    
    // Generate DKIM keys
    const dkimKeys = generateDKIMKeys();
    const dkimSelector = 'mail' + Math.floor(Date.now() / 1000);
    
    // Get server IP - in production, this would be dynamic
    const serverIP = '127.0.0.1';
    
    const id = uuidv4();
    
    await connection.query(`
      INSERT INTO domain_configs (
        id, domain_name, active, dkim_selector, dkim_public_key,
        dkim_private_key, dkim_txt_record, spf_record,
        dkim_verified, spf_verified, mx_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      domainName,
      false,
      dkimSelector,
      dkimKeys.publicKey,
      dkimKeys.privateKey,
      generateDKIMTxtRecord(dkimKeys.publicKey),
      `v=spf1 ip4:${serverIP} -all`,
      false,
      false,
      false
    ]);
    
    const [result] = await connection.query(
      'SELECT * FROM domain_configs WHERE id = ?',
      [id]
    );
    
    await connection.commit();
    return result[0];
  } catch (error) {
    await connection.rollback();
    console.error(`Error creating domain config for ${domainName}:`, error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update domain configuration verification status
 * @param {string} domainName - Domain name
 * @param {Object} verificationStatus - Verification status
 * @returns {Promise<Object>} Updated domain configuration object
 */
async function updateDomainConfigVerification(domainName, verificationStatus) {
  try {
    const { dkimVerified, spfVerified, mxVerified, active } = verificationStatus;
    
    const updates = [];
    const values = [];
    
    if (dkimVerified !== undefined) {
      updates.push('dkim_verified = ?');
      values.push(dkimVerified);
    }
    
    if (spfVerified !== undefined) {
      updates.push('spf_verified = ?');
      values.push(spfVerified);
    }
    
    if (mxVerified !== undefined) {
      updates.push('mx_verified = ?');
      values.push(mxVerified);
    }
    
    if (active !== undefined) {
      updates.push('active = ?');
      values.push(active);
    }
    
    if (updates.length === 0) {
      return getDomainConfigByName(domainName);
    }
    
    values.push(domainName);
    
    await pool.query(
      `UPDATE domain_configs SET ${updates.join(', ')} WHERE domain_name = ?`,
      values
    );
    
    return getDomainConfigByName(domainName);
  } catch (error) {
    console.error(`Error updating domain config verification for ${domainName}:`, error.message);
    throw error;
  }
}

/**
 * Generate DNS setup instructions for a domain
 * @param {string} domainName - Domain name
 * @returns {Promise<Object>} DNS setup instructions
 */
async function generateDNSSetupInstructions(domainName) {
  try {
    const config = await getDomainConfigByName(domainName);
    if (!config) {
      return null;
    }
    
    return {
      dkim: {
        name: `${config.dkim_selector}._domainkey.${domainName}`,
        type: 'TXT',
        value: config.dkim_txt_record,
        description: 'DKIM signature verification'
      },
      spf: {
        name: domainName,
        type: 'TXT',
        value: config.spf_record,
        description: 'SPF record for sender verification'
      },
      mx: {
        name: domainName,
        type: 'MX',
        value: `10 mail.${domainName}`,
        description: 'Mail exchanger record for receiving emails'
      }
    };
  } catch (error) {
    console.error(`Error generating DNS setup instructions for ${domainName}:`, error.message);
    throw error;
  }
}

module.exports = {
  getAllDomainConfigs,
  getDomainConfigByName,
  createDomainConfig,
  updateDomainConfigVerification,
  generateDNSSetupInstructions
};