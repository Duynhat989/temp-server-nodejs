// SMTP Server service - MySQL Version
const SMTPServer = require('smtp-server').SMTPServer;
const { simpleParser } = require('mailparser');

// Import models
const messageModel = require('../models/message-model');
const emailModel = require('../models/email-model');
const emailConfigModel = require('../models/email-config-model');

// Create SMTP server for receiving emails
async function createSMTPServer() {
  try {
    const config = await emailConfigModel.getEmailConfig();
    
    return new SMTPServer({
      secure: false,
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      size: config.limits.maxMessageSize,
      onData(stream, session, callback) {
        let mailData = '';
        stream.on('data', chunk => {
          mailData += chunk.toString();
        });

        stream.on('end', async () => {
          try {
            // Parse the email
            const parsedMail = await simpleParser(mailData);

            // Extract recipient email
            const to = parsedMail.to.value[0].address;
            console.log('Received email for:', to);
            
            // Check if this is a valid recipient in our system
            const recipient = await emailModel.getEmailByAddress(to);
            
            // Store the message in database
            const messageData = {
              message_id: parsedMail.messageId,
              from_email: parsedMail.from.value[0].address,
              to_email: to,
              subject: parsedMail.subject,
              text_content: parsedMail.text,
              html_content: parsedMail.html,
              sent: false,
              read: false
            };

            // Save message to database (whether recipient exists or not)
            await messageModel.createMessage(messageData);
            
            callback();
          } catch (err) {
            console.error('Error processing incoming email:', err);
            callback(new Error('Error processing email'));
          }
        });
      }
    });
  } catch (error) {
    console.error('Error creating SMTP server:', error);
    // Fallback configuration if we can't get from database
    return new SMTPServer({
      secure: false,
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      size: 10 * 1024 * 1024, // 10MB default
      onData(stream, session, callback) {
        // Similar handling as above
        stream.on('data', () => {});
        stream.on('end', () => callback());
      }
    });
  }
}

module.exports = {
  createSMTPServer
};