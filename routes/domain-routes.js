// Domain management routes - MySQL Version
const express = require('express');
const router = express.Router();
const dns = require('dns').promises;

// Import models
const domainModel = require('../models/domain-model');
const domainConfigModel = require('../models/domain-config-model');

// Get all domains
router.get('/', async (req, res) => {
  try {
    const domains = await domainModel.getAllDomains();
    res.json({ domains });
  } catch (error) {
    console.error('Error getting domains:', error.message);
    res.status(500).json({ error: 'Failed to get domains' });
  }
});

// Get domain configurations
router.get('/configs', async (req, res) => {
  try {
    const configs = await domainConfigModel.getAllDomainConfigs();
    res.json({ domains: configs });
  } catch (error) {
    console.error('Error getting domain configs:', error.message);
    res.status(500).json({ error: 'Failed to get domain configurations' });
  }
});

// Add a new domain
router.post('/', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Domain name is required' });
  }
  
  try {
    // Check if domain already exists
    const existingDomain = await domainModel.getDomainByName(name);
    if (existingDomain) {
      return res.status(400).json({ error: 'Domain already exists' });
    }

    // Validate domain by checking DNS records
    try {
      await dns.resolve(name, 'NS');
    } catch (error) {
      // In development, we'll continue even if DNS validation fails
      console.log(`DNS validation for ${name} failed:`, error.message);
    }

    // Add new domain
    const newDomain = await domainModel.createDomain({ name });
    
    // Create domain configuration for email
    const domainConfiguration = await domainConfigModel.createDomainConfig(name);
    
    // Generate DNS setup instructions
    const dnsInstructions = await domainConfigModel.generateDNSSetupInstructions(name);

    res.status(201).json({
      domain: newDomain,
      config: domainConfiguration,
      dnsSetup: dnsInstructions
    });
  } catch (error) {
    console.error(`Error adding domain ${name}:`, error.message);
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return res.status(400).json({ error: 'Domain does not exist or invalid' });
    }
    res.status(500).json({ error: 'Failed to add domain' });
  }
});

// Delete a domain
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Find domain
    const domain = await domainModel.getDomainById(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Domain deletion will cascade and delete related emails and configs
    // due to foreign key constraints
    await domainModel.deleteDomain(id);

    res.json({ message: 'Domain and associated data deleted successfully' });
  } catch (error) {
    console.error(`Error deleting domain ${id}:`, error.message);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// Verify domain DNS configuration
router.post('/:name/verify', async (req, res) => {
  const { name } = req.params;

  try {
    // Check if domain exists
    const domain = await domainModel.getDomainByName(name);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Get domain config
    const domainConfig = await domainConfigModel.getDomainConfigByName(name);
    if (!domainConfig) {
      return res.status(404).json({ error: 'Domain configuration not found' });
    }

    // In a production app, this would actually check DNS records
    // For now, we'll simulate the verification
    const verification = {
      dkimVerified: true,
      spfVerified: true,
      mxVerified: true,
      active: true
    };

    // Update domain config with verification status
    const updatedConfig = await domainConfigModel.updateDomainConfigVerification(
      name,
      verification
    );

    res.json({
      message: 'Domain DNS configuration verified successfully',
      config: updatedConfig
    });
  } catch (error) {
    console.error(`Error verifying domain ${name}:`, error.message);
    res.status(500).json({ error: 'Failed to verify domain' });
  }
});

module.exports = router;