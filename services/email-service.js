// Email sending service - Sequelize Version
const nodemailer = require('nodemailer');
const DomainConfig = require('../models/domain-config-model');

// Nodemailer transporter
let transporter = null;

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
      const domainCfg = await DomainConfig.findOne({
        where: { domainName: fromDomain, active: true }
      });

      // Add DKIM signing if we have configuration
      if (domainCfg) {
        transporterConfig.dkim = {
          domainName: domainCfg.domainName,
          keySelector: domainCfg.dkimSelector,
          privateKey: domainCfg.dkimPrivateKey
        };
      }
    }

    // For production use, you'd configure real SMTP settings:
    // const transporterConfig = {
    //     host: process.env.SMTP_HOST,
    //     port: process.env.SMTP_PORT,
    //     secure: process.env.SMTP_SECURE === 'true',
    //     auth: {
    //         user: process.env.SMTP_USER,
    //         pass: process.env.SMTP_PASS
    //     }
    // };

    transporter = nodemailer.createTransport(transporterConfig);
    return transporter;
  } catch (error) {
    console.error('Error setting up transporter:', error);
    throw error;
  }
}

/**
 * Get current transporter or create a new one
 * @param {string} fromDomain - Domain for sending email
 * @returns {Promise<Object>} Nodemailer transporter
 */
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

/**
 * Send an email
 * @param {Object} mailOptions - Nodemailer mail options
 * @returns {Promise<Object>} Mail send result
 */
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