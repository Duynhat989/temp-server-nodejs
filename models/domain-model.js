// Domain model for database operations
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');

/**
 * Get all domains
 * @returns {Promise<Array>} Array of domain objects
 */
async function getAllDomains() {
  try {
    const [rows] = await pool.query('SELECT * FROM domains ORDER BY created_at DESC');
    return rows;
  } catch (error) {
    console.error('Error getting domains:', error.message);
    throw error;
  }
}

/**
 * Get domain by ID
 * @param {string} id - Domain ID
 * @returns {Promise<Object>} Domain object
 */
async function getDomainById(id) {
  try {
    const [rows] = await pool.query('SELECT * FROM domains WHERE id = ?', [id]);
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting domain ${id}:`, error.message);
    throw error;
  }
}

/**
 * Get domain by name
 * @param {string} name - Domain name
 * @returns {Promise<Object>} Domain object
 */
async function getDomainByName(name) {
  try {
    const [rows] = await pool.query('SELECT * FROM domains WHERE name = ?', [name]);
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting domain ${name}:`, error.message);
    throw error;
  }
}

/**
 * Create a new domain
 * @param {Object} domainData - Domain data
 * @returns {Promise<Object>} Created domain object
 */
async function createDomain(domainData) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const id = uuidv4();
    const { name } = domainData;
    
    await connection.query(
      'INSERT INTO domains (id, name) VALUES (?, ?)',
      [id, name]
    );
    
    const [result] = await connection.query(
      'SELECT * FROM domains WHERE id = ?',
      [id]
    );
    
    await connection.commit();
    return result[0];
  } catch (error) {
    await connection.rollback();
    console.error('Error creating domain:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update a domain
 * @param {string} id - Domain ID
 * @param {Object} domainData - Domain data to update
 * @returns {Promise<Object>} Updated domain object
 */
async function updateDomain(id, domainData) {
  try {
    const { name } = domainData;
    
    await pool.query(
      'UPDATE domains SET name = ? WHERE id = ?',
      [name, id]
    );
    
    return getDomainById(id);
  } catch (error) {
    console.error(`Error updating domain ${id}:`, error.message);
    throw error;
  }
}

/**
 * Delete a domain
 * @param {string} id - Domain ID
 * @returns {Promise<boolean>} True if successful
 */
async function deleteDomain(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // This will cascade delete related records in other tables
    // due to foreign key constraints
    await connection.query('DELETE FROM domains WHERE id = ?', [id]);
    
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error(`Error deleting domain ${id}:`, error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllDomains,
  getDomainById,
  getDomainByName,
  createDomain,
  updateDomain,
  deleteDomain
};