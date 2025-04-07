// Message management routes - MySQL Version
const express = require('express');
const router = express.Router();

// Import models
const messageModel = require('../models/message-model');
const emailModel = require('../models/email-model');
const domainConfigModel = require('../models/domain-config-model');

// Import services
const { sendEmail, getTransporter } = require('../services/email-service');

// Get messages for an email
router.get('/:email', async (req, res) => {
  const { email } = req.params;

  try {
    // Check if email exists
    const emailExists = await emailModel.getEmailByAddress(email);
    if (!emailExists) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Get messages for this email
    const messages = await messageModel.getMessagesForEmail(email);
    
    res.json({ messages });
  } catch (error) {
    console.error(`Error getting messages for ${email}:`, error.message);
    res.status(500).json({ error: 'Error getting messages' });
  }
});

// Get sent messages for an email
router.get('/:email/sent', async (req, res) => {
  const { email } = req.params;

  try {
    // Check if email exists
    const emailExists = await emailModel.getEmailByAddress(email);
    if (!emailExists) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Get sent messages for this email
    const messages = await messageModel.getSentMessagesForEmail(email);
    
    res.json({ messages });
  } catch (error) {
    console.error(`Error getting sent messages for ${email}:`, error.message);
    res.status(500).json({ error: 'Error getting sent messages' });
  }
});

// Mark message as read
router.patch('/:email/:messageId/read', async (req, res) => {
  const { email, messageId } = req.params;

  try {
    // Check if the message exists and belongs to this email
    const message = await messageModel.getMessageForEmailById(email, messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Mark message as read
    const updatedMessage = await messageModel.markMessageAsRead(messageId);
    
    res.json({ message: 'Message marked as read', data: updatedMessage });
  } catch (error) {
    console.error(`Error marking message ${messageId} as read:`, error.message);
    res.status(500).json({ error: 'Error updating message' });
  }
});

// Delete a message
router.delete('/:email/:messageId', async (req, res) => {
  const { email, messageId } = req.params;

  try {
    // Check if the message exists and belongs to this email
    const message = await messageModel.getMessageForEmailById(email, messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Delete the message
    await messageModel.deleteMessage(messageId);
    
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error(`Error deleting message ${messageId}:`, error.message);
    res.status(500).json({ error: 'Error deleting message' });
  }
});

// Send a new email
async function sendEmailHandler(req, res) {
  const { from, to, subject, text, html } = req.body;

  try {
    if (!from || !to || !subject) {
      return res.status(400).json({ error: 'From, to, and subject are required' });
    }

    // Check if sender email exists in our system
    const sender = await emailModel.getEmailByAddress(from);
    if (!sender) {
      return res.status(404).json({ error: 'Sender email not found' });
    }

    // Get domain from sender email
    const fromDomain = from.split('@')[1];

    // Check if domain is configured
    const domainCfg = await domainConfigModel.getDomainConfigByName(fromDomain);
    if (!domainCfg) {
      return res.status(400).json({
        error: 'Domain not properly configured for sending emails',
        instructions: 'Please add domain configuration first'
      });
    }

    // Check if domain is active
    if (!domainCfg.active) {
      return res.status(400).json({
        error: 'Domain is not active for sending emails',
        instructions: 'Please activate the domain or verify DNS settings'
      });
    }

    // Initialize or update transporter with domain-specific settings
    getTransporter(fromDomain);

    // Send email with proper headers
    const mailOptions = {
      from: {
        name: sender.name || from.split('@')[0],
        address: from
      },
      to,
      subject,
      text,
      html,
      headers: {
        'X-Mailer': 'SimpleEmailServer/1.0',
        'Message-ID': `<${Date.now()}.${Math.random().toString(36).substring(2)}@${fromDomain}>`
      }
    };

    const info = await sendEmail(mailOptions);

    // Store message in database
    const messageData = {
      message_id: info.messageId,
      from_email: from,
      to_email: to,
      subject,
      text_content: text,
      html_content: html,
      sent: true,
      read: false
    };

    const newMessage = await messageModel.createMessage(messageData);

    // Return successful response with delivery info
    res.json({
      message: 'Email sent successfully',
      id: newMessage.id,
      messageId: info.messageId,
      deliveryInfo: info.response
    });
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}

module.exports = router;
module.exports.sendEmail = sendEmailHandler;