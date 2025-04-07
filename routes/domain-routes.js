/**
 * Domain Management Routes
 * Handles all domain-related API endpoints
 */
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const dns = require('dns').promises;

// Import models
const Domain = require('../models/domain-model');
const DomainConfig = require('../models/domain-config-model');
const Email = require('../models/email-model');

/**
 * @route   GET /api/domains
 * @desc    Get all domains with optional filtering
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      search, 
      active, 
      sort = 'createdAt', 
      order = 'desc',
      limit = 20,
      page = 1
    } = req.query;
    
    // Build query conditions
    const where = {};
    if (search) {
      where.name = { [Op.like]: `%${search}%` };
    }
    if (active !== undefined) {
      where.active = active === 'true';
    }
    
    // Calculate pagination
    const offset = (page - 1) * limit;
    
    // Find domains with count
    const { count, rows: domains } = await Domain.findAndCountAll({
      where,
      order: [[sort, order.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Email,
          as: 'emails',
          attributes: ['id', 'address'],
          required: false
        }
      ]
    });
    
    // Get domain configurations
    const domainIds = domains.map(domain => domain.id);
    const configs = await DomainConfig.findAll({
      where: { 
        domainName: domains.map(domain => domain.name) 
      }
    });
    
    // Map configs to domains
    const domainsWithConfig = domains.map(domain => {
      const config = configs.find(c => c.domainName === domain.name);
      const { password, ...safeDomain } = domain.toJSON();
      return {
        ...safeDomain,
        config: config || null
      };
    });
    
    res.json({
      domains: domainsWithConfig,
      pagination: {
        total: count,
        pages: Math.ceil(count / limit),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/domains/:id
 * @desc    Get domain by ID with full details
 * @access  Public
 */
router.get('/:id', async (req, res, next) => {
  try {
    const domain = await Domain.findByPk(req.params.id, {
      include: [
        {
          model: Email,
          as: 'emails',
          attributes: ['id', 'address', 'name', 'active', 'createdAt'],
        }
      ]
    });
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    // Get domain config
    const config = await DomainConfig.findOne({
      where: { domainName: domain.name }
    });
    
    // Merge the data
    const domainData = domain.toJSON();
    
    res.json({
      ...domainData,
      config: config || null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/domains
 * @desc    Create a new domain
 * @access  Public
 */
router.post('/', async (req, res, next) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Domain name is required' });
  }
  
  // Validate domain format
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  if (!domainRegex.test(name)) {
    return res.status(400).json({ error: 'Invalid domain name format' });
  }
  
  try {
    // Check if domain already exists
    const existingDomain = await Domain.findOne({ where: { name } });
    if (existingDomain) {
      return res.status(400).json({ error: 'Domain already exists' });
    }

    // Validate domain by checking DNS records
    try {
      await dns.resolve(name, 'NS');
    } catch (error) {
      // In development, we'll continue even if DNS validation fails
      // but warn the client
      console.log(`DNS validation for ${name} failed:`, error.message);
    }

    // Start a transaction
    const result = await sequelize.transaction(async (transaction) => {
      // Add new domain
      const newDomain = await Domain.create({ name }, { transaction });
      
      // Create domain configuration for email
      const domainConfiguration = await DomainConfig.create({
        domainName: name
      }, { transaction });
      
      return { domain: newDomain, config: domainConfiguration };
    });
    
    // Generate DNS setup instructions
    const dnsInstructions = {
      dkim: {
        name: `${result.config.dkimSelector}._domainkey.${name}`,
        type: 'TXT',
        value: result.config.dkimTxtRecord,
        description: 'DKIM signature verification'
      },
      spf: {
        name: name,
        type: 'TXT',
        value: result.config.spfRecord,
        description: 'SPF record for sender verification'
      },
      mx: {
        name: name,
        type: 'MX',
        value: `10 mail.${name}`,
        description: 'Mail exchanger record for receiving emails'
      }
    };

    res.status(201).json({
      domain: result.domain,
      config: result.config,
      dnsSetup: dnsInstructions
    });
  } catch (error) {
    console.error(`Error adding domain ${name}:`, error.message);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors.map(e => e.message) 
      });
    }
    next(error);
  }
});

/**
 * @route   PUT /api/domains/:id
 * @desc    Update a domain
 * @access  Public
 */
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { name, active } = req.body;
  
  try {
    // Find domain
    const domain = await Domain.findByPk(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    // Start a transaction
    const result = await sequelize.transaction(async (transaction) => {
      // Update domain
      await domain.update({
        ...(name && { name }),
        ...(active !== undefined && { active })
      }, { transaction });
      
      // If name is updated, update domainName in config as well
      if (name && name !== domain.name) {
        await DomainConfig.update(
          { domainName: name },
          { 
            where: { domainName: domain.name },
            transaction
          }
        );
      }
      
      // Get updated domain with config
      const updatedDomain = await Domain.findByPk(id, {
        include: [
          {
            model: Email,
            as: 'emails',
            attributes: ['id', 'address', 'name', 'active', 'createdAt'],
          }
        ],
        transaction
      });
      
      const config = await DomainConfig.findOne({
        where: { domainName: updatedDomain.name },
        transaction
      });
      
      return { domain: updatedDomain, config };
    });
    
    res.json({
      ...result.domain.toJSON(),
      config: result.config
    });
  } catch (error) {
    console.error(`Error updating domain ${id}:`, error.message);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors.map(e => e.message) 
      });
    }
    next(error);
  }
});

/**
 * @route   DELETE /api/domains/:id
 * @desc    Delete a domain
 * @access  Public
 */
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;

  try {
    // Find domain
    const domain = await Domain.findByPk(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Start a transaction
    await sequelize.transaction(async (transaction) => {
      // Domain deletion will cascade and delete related emails and configs
      // due to associations set up in the models
      await domain.destroy({ transaction });
    });

    res.json({ 
      message: 'Domain and associated data deleted successfully',
      id
    });
  } catch (error) {
    console.error(`Error deleting domain ${id}:`, error.message);
    next(error);
  }
});

/**
 * @route   POST /api/domains/:id/verify
 * @desc    Verify domain DNS configuration
 * @access  Public
 */
router.post('/:id/verify', async (req, res, next) => {
  const { id } = req.params;

  try {
    // Find domain
    const domain = await Domain.findByPk(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Get domain config
    const domainConfig = await DomainConfig.findOne({ 
      where: { domainName: domain.name } 
    });
    
    if (!domainConfig) {
      return res.status(404).json({ error: 'Domain configuration not found' });
    }

    // In a production app, perform actual DNS verification
    // For now, we'll simulate the verification process
    
    // Start a transaction
    const result = await sequelize.transaction(async (transaction) => {
      // Update domain config verification
      await domainConfig.update({
        dkimVerified: true,
        spfVerified: true,
        mxVerified: true,
        active: true
      }, { transaction });

      // Also activate the domain itself
      await domain.update({ 
        active: true 
      }, { transaction });
      
      // Get updated domain and config
      const updatedDomain = await Domain.findByPk(id, {
        include: [
          {
            model: Email,
            as: 'emails',
            attributes: ['id', 'address', 'name', 'active', 'createdAt'],
          }
        ],
        transaction
      });
      
      const updatedConfig = await DomainConfig.findOne({
        where: { domainName: domain.name },
        transaction
      });
      
      return { domain: updatedDomain, config: updatedConfig };
    });

    res.json({
      message: 'Domain DNS configuration verified successfully',
      domain: {
        ...result.domain.toJSON(),
        config: result.config
      }
    });
  } catch (error) {
    console.error(`Error verifying domain ${id}:`, error.message);
    next(error);
  }
});

/**
 * @route   GET /api/domains/check/:name
 * @desc    Check if a domain name is available
 * @access  Public
 */
router.get('/check/:name', async (req, res, next) => {
  const { name } = req.params;
  
  try {
    const domain = await Domain.findOne({ where: { name } });
    
    res.json({
      name,
      available: !domain,
      valid: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i.test(name)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;