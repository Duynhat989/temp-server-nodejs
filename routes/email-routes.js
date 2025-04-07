// Email account management routes - MySQL Version
const express = require('express');
const router = express.Router();

// Import models
const emailModel = require('../models/email-model');
const domainModel = require('../models/domain-model');

// Get all emails
router.get('/', async (req, res) => {
  try {
    const emails = await emailModel.getAllEmails();
    res.json({ emails });
  } catch (error) {
    console.error('Error getting emails:', error.message);
    res.status(500).json({ error: 'Failed to get emails' });
  }
});

// Get email by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const email = await emailModel.getEmailById(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    res.json(email);
  } catch (error) {
    console.error(`Error getting email ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to get email' });
  }
});

// Add a new email
router.post('/', async (req, res) => {
  const { address, password, name } = req.body;

  if (!address || !password) {
    return res.status(400).json({ error: 'Email address and password are required' });
  }

  // Check email format
  if (!address.includes('@')) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    // Check if domain exists
    const domain = address.split('@')[1];
    const domainExists = await domainModel.getDomainByName(domain);
    
    if (!domainExists) {
      return res.status(400).json({ error: 'Domain not configured in the system' });
    }

    // Check if email already exists
    const existingEmail = await emailModel.getEmailByAddress(address);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Add new email
    const newEmail = await emailModel.createEmail({
      address,
      password,
      name
    });

    res.status(201).json(newEmail);
  } catch (error) {
    console.error('Error creating email:', error.message);
    res.status(500).json({ error: 'Failed to create email' });
  }
});

// Update an email
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, password } = req.body;
  
  try {
    // Check if email exists
    const existingEmail = await emailModel.getEmailById(id);
    if (!existingEmail) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    // Update email
    const updatedEmail = await emailModel.updateEmail(id, {
      name,
      password
    });
    
    res.json(updatedEmail);
  } catch (error) {
    console.error(`Error updating email ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// Delete an email
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if email exists
    const existingEmail = await emailModel.getEmailById(id);
    if (!existingEmail) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Delete email
    await emailModel.deleteEmail(id);

    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error(`Error deleting email ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// Email authentication
async function authenticate(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const authenticatedUser = await emailModel.authenticateEmail(email, password);
    
    if (!authenticatedUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json(authenticatedUser);
  } catch (error) {
    console.error('Error during authentication:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

module.exports = router;
module.exports.authenticate = authenticate;