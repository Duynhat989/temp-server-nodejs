// Email sending service - MySQL Version
const nodemailer = require('nodemailer');
const domainConfigModel = require('../models/domain-config-model');

// Nodemailer transporter
let transporter = null;

// Setup transporter with DKIM support
async function setupTransporter(fromDomain) {
  try {
    // Default config for local development
    const transporterConfig = {
      host: 'localhost',
      port: 2525,
      secure: false,
      tls: {
        rejectUnauthorized: false
      }
    };

    // Add domain-specific configuration if available
    if (fromDomain) {
      // Check if we have configuration for this domain
      const domainCfg = await domainConfigModel.getDomainConfigByName(fromDomain);

      // Add DKIM signing if we have configuration and domain is active
      if (domainCfg && domainCfg.active) {
        transporterConfig.dkim = {
          domainName: domainCfg.domain_name,
          keySelector: domainCfg.dkim_selector,
          privateKey: domainCfg.dkim_private_key
        };
      }
    }

    // For production use, you'd configure real SMTP settings:
    // const transporterConfig = {
    //     host: 'your-smtp-server.com',
    //     port: 587,
    //     secure: false, // true for 465, false for other ports
    //     auth: {
    //         user: 'smtp-username',
    //         pass: 'smtp-password'
    //     }
    // };

    transporter = nodemailer.createTransport(transporterConfig);
    return transporter;
  } catch (error) {
    console.error('Error setting up transporter:', error);
    throw error;
  }
}

// Get current transporter or create a new one
async function getTransporter(fromDomain) {
  try {
    if (!transporter || fromDomain) {
      return await setupTransporter(fromDomain);
    }
    return transporter;
  } catch (error) {
    console.error('Error getting transporter:', error);
    throw error;
  }
}

// Send an email
async function sendEmail(mailOptions) {
  try {
    const fromDomain = mailOptions.from.address.split('@')[1];
    const emailTransporter = await getTransporter(fromDomain);
    return await emailTransporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = {
  setupTransporter,
  getTransporter,
  sendEmail
};