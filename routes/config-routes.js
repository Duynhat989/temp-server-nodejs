// Email configuration routes - MySQL Version
const express = require('express');
const router = express.Router();

// Import models
const emailConfigModel = require('../models/email-config-model');
const emailConfig = require('../config/email-config');

// Get email configuration
router.get('/', async (req, res) => {
  try {
    const config = await emailConfigModel.getEmailConfig();
    
    // Remove sensitive information
    if (config.outbound && config.outbound.relayPassword) {
      config.outbound.relayPassword = '********';
    }
    
    res.json(config);
  } catch (error) {
    console.error('Error getting email config:', error.message);
    res.status(500).json({ error: 'Failed to get email configuration' });
  }
});

// Update email configuration
router.post('/', async (req, res) => {
  try {
    const newConfig = req.body;
    const updated = await emailConfigModel.updateEmailConfig(newConfig);

    // Remove sensitive information for response
    if (updated.outbound && updated.outbound.relayPassword) {
      updated.outbound.relayPassword = '********';
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating email config:', error.message);
    res.status(500).json({ error: 'Failed to update email configuration', details: error.message });
  }
});

// Check DNS configuration for a domain
router.get('/dns/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const dnsCheck = await emailConfigModel.checkDNSConfiguration(domain);
    res.json(dnsCheck);
  } catch (error) {
    console.error(`Error checking DNS config for ${domain}:`, error.message);
    res.status(500).json({ error: 'Failed to check DNS configuration', details: error.message });
  }
});

// Check if port 25 is open
router.get('/port-check', async (req, res) => {
  try {
    const port25Check = await emailConfigModel.checkPort25IsOpen();
    const internetCheck = await emailConfigModel.checkPortIsOpenFromInternet(25);

    res.json({
      local: port25Check,
      internet: internetCheck
    });
  } catch (error) {
    console.error('Error checking port:', error.message);
    res.status(500).json({ error: 'Failed to check port', details: error.message });
  }
});

// Configure Postfix for a domain
router.post('/postfix/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    console.log(`Configuring Postfix for domain: ${domain}`);
    const result = await emailConfig.configurePostfix(domain);
    res.json(result);
  } catch (error) {
    console.error(`Error configuring Postfix for ${domain}:`, error.message);
    res.status(500).json({ error: 'Failed to configure Postfix', details: error.message });
  }
});

// Apply Postfix configuration
router.post('/postfix/:domain/apply', async (req, res) => {
  try {
    const { domain } = req.params;
    const forceRestart = req.query.restart === 'true';

    const result = await emailConfig.applyPostfixConfig(domain, forceRestart);
    res.json(result);
  } catch (error) {
    console.error(`Error applying Postfix config for ${domain}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to apply Postfix configuration',
      details: error.message
    });
  }
});

// Generate inbound email setup instructions
router.get('/inbound-guide', async (req, res) => {
  try {
    const guide = await emailConfigModel.generateInboundEmailInstructions();
    res.json(guide);
  } catch (error) {
    console.error('Error generating inbound guide:', error.message);
    res.status(500).json({ error: 'Failed to generate guide', details: error.message });
  }
});

module.exports = router;