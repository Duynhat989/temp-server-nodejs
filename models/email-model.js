// Email model for database operations
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * Get all email accounts
 * @returns {Promise<Array>} Array of email objects
 */
async function getAllEmails() {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, d.name as domain_name 
      FROM emails e
      JOIN domains d ON SUBSTRING_INDEX(e.address, '@', -1) = d.name
      ORDER BY e.created_at DESC
    `);
    return rows;
  } catch (error) {
    console.error('Error getting emails:', error.message);
    throw error;
  }
}

/**
 * Get email by ID
 * @param {string} id - Email ID
 * @returns {Promise<Object>} Email object
 */
async function getEmailById(id) {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, d.name as domain_name 
      FROM emails e
      JOIN domains d ON SUBSTRING_INDEX(e.address, '@', -1) = d.name
      WHERE e.id = ?
    `, [id]);
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting email ${id}:`, error.message);
    throw error;
  }
}

/**
 * Get email by address
 * @param {string} address - Email address
 * @returns {Promise<Object>} Email object
 */
async function getEmailByAddress(address) {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, d.name as domain_name 
      FROM emails e
      JOIN domains d ON SUBSTRING_INDEX(e.address, '@', -1) = d.name
      WHERE e.address = ?
    `, [address]);
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting email ${address}:`, error.message);
    throw error;
  }
}

/**
 * Create a new email account
 * @param {Object} emailData - Email data
 * @returns {Promise<Object>} Created email object
 */
async function createEmail(emailData) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const id = uuidv4();
    const { address, password, name } = emailData;
    
    // Extract domain from email address
    const domain = address.split('@')[1];
    
    // Get domain id
    const [domainResult] = await connection.query(
      'SELECT id FROM domains WHERE name = ?',
      [domain]
    );
    
    if (domainResult.length === 0) {
      throw new Error(`Domain ${domain} not found`);
    }
    
    const domainId = domainResult[0].id;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await connection.query(
      'INSERT INTO emails (id, address, password, name, domain_id) VALUES (?, ?, ?, ?, ?)',
      [id, address, hashedPassword, name || '', domainId]
    );
    
    const [result] = await connection.query(`
      SELECT e.id, e.address, e.name, e.created_at, d.name as domain_name
      FROM emails e
      JOIN domains d ON e.domain_id = d.id
      WHERE e.id = ?
    `, [id]);
    
    await connection.commit();
    return result[0];
  } catch (error) {
    await connection.rollback();
    console.error('Error creating email:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update an email account
 * @param {string} id - Email ID
 * @param {Object} emailData - Email data to update
 * @returns {Promise<Object>} Updated email object
 */
async function updateEmail(id, emailData) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { name, password } = emailData;
    
    if (name) {
      await connection.query(
        'UPDATE emails SET name = ? WHERE id = ?',
        [name, id]
      );
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.query(
        'UPDATE emails SET password = ? WHERE id = ?',
        [hashedPassword, id]
      );
    }
    
    const [result] = await connection.query(`
      SELECT e.id, e.address, e.name, e.created_at, d.name as domain_name
      FROM emails e
      JOIN domains d ON e.domain_id = d.id
      WHERE e.id = ?
    `, [id]);
    
    await connection.commit();
    return result[0];
  } catch (error) {
    await connection.rollback();
    console.error(`Error updating email ${id}:`, error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Delete an email account
 * @param {string} id - Email ID
 * @returns {Promise<boolean>} True if successful
 */
async function deleteEmail(id) {
  try {
    await pool.query('DELETE FROM emails WHERE id = ?', [id]);
    return true;
  } catch (error) {
    console.error(`Error deleting email ${id}:`, error.message);
    throw error;
  }
}

/**
 * Authenticate an email account
 * @param {string} address - Email address
 * @param {string} password - Password
 * @returns {Promise<Object|null>} Email object if successful, null otherwise
 */
async function authenticateEmail(address, password) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM emails WHERE address = ?',
      [address]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const email = rows[0];
    const isValid = await bcrypt.compare(password, email.password);
    
    if (!isValid) {
      return null;
    }
    
    // Return email without password
    const { password: _, ...emailWithoutPassword } = email;
    return emailWithoutPassword;
  } catch (error) {
    console.error(`Error authenticating email ${address}:`, error.message);
    throw error;
  }
}

module.exports = {
  getAllEmails,
  getEmailById,
  getEmailByAddress,
  createEmail,
  updateEmail,
  deleteEmail,
  authenticateEmail
};