// Message model for database operations
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');

/**
 * Get messages for an email address
 * @param {string} email - Email address
 * @returns {Promise<Array>} Array of message objects
 */
async function getMessagesForEmail(email) {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM messages 
      WHERE to_email = ? 
      ORDER BY created_at DESC
    `, [email]);
    return rows;
  } catch (error) {
    console.error(`Error getting messages for ${email}:`, error.message);
    throw error;
  }
}

/**
 * Get sent messages for an email address
 * @param {string} email - Email address
 * @returns {Promise<Array>} Array of message objects
 */
async function getSentMessagesForEmail(email) {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM messages 
      WHERE from_email = ? AND sent = TRUE
      ORDER BY created_at DESC
    `, [email]);
    return rows;
  } catch (error) {
    console.error(`Error getting sent messages for ${email}:`, error.message);
    throw error;
  }
}

/**
 * Get message by ID
 * @param {string} id - Message ID
 * @returns {Promise<Object>} Message object
 */
async function getMessageById(id) {
  try {
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [id]);
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting message ${id}:`, error.message);
    throw error;
  }
}

/**
 * Create a new message
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Created message object
 */
async function createMessage(messageData) {
  try {
    const id = uuidv4();
    const {
      message_id,
      from_email,
      to_email,
      subject,
      text_content,
      html_content,
      sent = false,
      read = false
    } = messageData;
    
    await pool.query(`
      INSERT INTO messages (
        id, message_id, from_email, to_email, subject, 
        text_content, html_content, sent, read
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, message_id, from_email, to_email, subject,
      text_content, html_content, sent, read
    ]);
    
    return getMessageById(id);
  } catch (error) {
    console.error('Error creating message:', error.message);
    throw error;
  }
}

/**
 * Mark a message as read
 * @param {string} id - Message ID
 * @returns {Promise<Object>} Updated message object
 */
async function markMessageAsRead(id) {
  try {
    await pool.query('UPDATE messages SET read = TRUE WHERE id = ?', [id]);
    return getMessageById(id);
  } catch (error) {
    console.error(`Error marking message ${id} as read:`, error.message);
    throw error;
  }
}

/**
 * Delete a message
 * @param {string} id - Message ID
 * @returns {Promise<boolean>} True if successful
 */
async function deleteMessage(id) {
  try {
    await pool.query('DELETE FROM messages WHERE id = ?', [id]);
    return true;
  } catch (error) {
    console.error(`Error deleting message ${id}:`, error.message);
    throw error;
  }
}

/**
 * Get message for a specific email and message ID
 * @param {string} email - Email address
 * @param {string} messageId - Message ID
 * @returns {Promise<Object>} Message object
 */
async function getMessageForEmailById(email, messageId) {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM messages 
      WHERE (to_email = ? OR from_email = ?) AND id = ?
    `, [email, email, messageId]);
    return rows[0] || null;
  } catch (error) {
    console.error(`Error getting message ${messageId} for ${email}:`, error.message);
    throw error;
  }
}

module.exports = {
  getMessagesForEmail,
  getSentMessagesForEmail,
  getMessageById,
  createMessage,
  markMessageAsRead,
  deleteMessage,
  getMessageForEmailById
};