// Email account management routes - Sequelize Version
const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');

// Import models
const Email = require('../models/email-model');
const Domain = require('../models/domain-model');

// Get all emails
router.get('/', async (req, res, next) => {
  try {
    const emails = await Email.findAll({
      include: [{ 
        model: Domain,
        as: 'domain'
      }],
      order: [['createdAt', 'DESC']]
    });
    
    // Remove password from response
    const safeEmails = emails.map(email => email.safeReturn());
    
    res.json({ emails: safeEmails });
  } catch (error) {
    next(error);
  }
});

// Get email by ID
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  
  try {
    const email = await Email.findByPk(id, {
      include: [{ 
        model: Domain,
        as: 'domain'
      }]
    });
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    res.json(email.safeReturn());
  } catch (error) {
    next(error);
  }
});

// Add a new email
router.post('/', async (req, res, next) => {
  const { address, password, name } = req.body;

  if (!address || !password) {
    return res.status(400).json({ error: 'Email address and password are required' });
  }

  try {
    // Extract domain from email address
    const domainName = address.split('@')[1];
    if (!domainName) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if domain exists
    const domain = await Domain.findOne({ where: { name: domainName } });
    if (!domain) {
      return res.status(400).json({ error: 'Domain not configured in the system' });
    }

    // Check if email already exists
    const existingEmail = await Email.findOne({ where: { address } });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Add new email
    const newEmail = await Email.create({
      address,
      password,
      name: name || '',
      domainId: domain.id
    });

    res.status(201).json(newEmail.safeReturn());
  } catch (error) {
    console.error('Error creating email:', error.message);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors.map(e => e.message) 
      });
    }
    next(error);
  }
});

// Update an email
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { name, password, active } = req.body;
  
  try {
    // Check if email exists
    const email = await Email.findByPk(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    // Update fields that were provided
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (password !== undefined) updateData.password = password;
    if (active !== undefined) updateData.active = active;
    
    // Update email
    await email.update(updateData);
    
    // Fetch updated email with domain info
    const updatedEmail = await Email.findByPk(id, {
      include: [{ 
        model: Domain,
        as: 'domain'
      }]
    });
    
    res.json(updatedEmail.safeReturn());
  } catch (error) {
    console.error(`Error updating email ${id}:`, error.message);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors.map(e => e.message) 
      });
    }
    next(error);
  }
});

// Delete an email
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;

  try {
    // Check if email exists
    const email = await Email.findByPk(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Delete email - this will cascade to messages due to association
    await email.destroy();

    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error(`Error deleting email ${id}:`, error.message);
    next(error);
  }
});

// Email authentication
async function authenticate(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const authenticatedUser = await Email.authenticate(email, password);
    
    if (!authenticatedUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json(authenticatedUser);
  } catch (error) {
    console.error('Error during authentication:', error.message);
    next(error);
  }
}

module.exports = router;
module.exports.authenticate = authenticate;