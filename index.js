// Import required packages
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const SMTPServer = require('smtp-server').SMTPServer;
const dns = require('dns').promises;
const domainConfig = require('./domain-config');
const emailConfig = require('./email-config');

// Initialize Express app
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const DOMAINS_FILE = path.join(DATA_DIR, 'domains.json');
const EMAILS_FILE = path.join(DATA_DIR, 'emails.json');
const MESSAGES_DIR = path.join(DATA_DIR, 'messages');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(MESSAGES_DIR)) {
    fs.mkdirSync(MESSAGES_DIR);
}

// Initialize data files if they don't exist
if (!fs.existsSync(DOMAINS_FILE)) {
    fs.writeFileSync(DOMAINS_FILE, JSON.stringify({ domains: [] }));
}
if (!fs.existsSync(EMAILS_FILE)) {
    fs.writeFileSync(EMAILS_FILE, JSON.stringify({ emails: [] }));
}

// Load data
let domainsData = JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
let emailsData = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf8'));

// Save data to JSON files
function saveData() {
    fs.writeFileSync(DOMAINS_FILE, JSON.stringify(domainsData, null, 2));
    fs.writeFileSync(EMAILS_FILE, JSON.stringify(emailsData, null, 2));
}

// Helper function to get email by address
function getEmailByAddress(emailAddress) {
    return emailsData.emails.find(email => email.address === emailAddress);
}

// Helper function to validate email belongs to our domains
function isValidEmail(emailAddress) {
    const domain = emailAddress.split('@')[1];
    return domainsData.domains.some(d => d.name === domain);
}

// Setup SMTP server for receiving emails
const smtpServer = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    size: emailConfig.getConfig().limits.maxMessageSize,
    onData(stream, session, callback) {
        let mailData = '';
        stream.on('data', chunk => {
            mailData += chunk;
        });

        stream.on('end', async () => {
            try {
                // Parse the email
                const parsedMail = await simpleParser(mailData);

                // Check if recipient exists in our system
                const to = parsedMail.to.value[0].address;

                if (isValidEmail(to)) {
                    // Store the message
                    const messageId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                    const messageData = {
                        id: messageId,
                        to: to,
                        from: parsedMail.from.value[0].address,
                        subject: parsedMail.subject,
                        text: parsedMail.text,
                        html: parsedMail.html,
                        date: new Date().toISOString(),
                        read: false
                    };

                    // Create user message directory if it doesn't exist
                    const userDir = path.join(MESSAGES_DIR, to);
                    if (!fs.existsSync(userDir)) {
                        fs.mkdirSync(userDir);
                    }

                    // Save message to user's inbox
                    fs.writeFileSync(
                        path.join(userDir, `${messageId}.json`),
                        JSON.stringify(messageData, null, 2)
                    );

                    console.log(`Email received for ${to}`);
                } else {
                    console.log(`Rejected email for unknown recipient: ${to}`);
                }

                callback();
            } catch (err) {
                console.error('Error processing incoming email:', err);
                callback(new Error('Error processing email'));
            }
        });
    }
});

// Setup nodemailer for sending emails
let transporter = null;

// Setup transporter function with DKIM support
function setupTransporter(fromDomain) {
    // Check if we have configuration for this domain
    const domainCfg = domainConfig.getDomainConfigByName(fromDomain);

    const transporterConfig = {
        host: 'localhost', // For local development
        port: 25,
        secure: false, // For production, set to true for port 465
        tls: {
            rejectUnauthorized: false // For production, set to true
        }
    };

    // Add DKIM signing if we have configuration
    if (domainCfg && domainCfg.active) {
        transporterConfig.dkim = {
            domainName: domainCfg.domainName,
            keySelector: domainCfg.dkimSelector,
            privateKey: domainCfg.dkimPrivateKey
        };
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
}

// API Routes

// Get all domains
app.get('/api/domains', (req, res) => {
    res.json(domainsData);
});
app.get('/api/domains/configs', (req, res) => {
    const configs = domainConfig.createDomainConfig('mathsnap.org');
    res.json({ domains: configs });
});
// Add a new domain
app.post('/api/domains', async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Domain name is required' });
    }
    // Check if domain already exists
    if (domainsData.domains.some(domain => domain.name === name)) {
        return res.status(400).json({ error: 'Domain already exists' });
    }

    try {
        // Validate domain by checking DNS records
        try {
            await dns.resolve(name, 'NS');
        } catch (error) { }

        // Add new domain
        const newDomain = {
            id: Date.now().toString(),
            name,
            createdAt: new Date().toISOString()
        };

        try {
            domainsData.domains.push(newDomain);
            saveData();
        } catch (error) {

        }

        console.log(name);
        // Create domain configuration for email
        const domainConfiguration = domainConfig.createDomainConfig(name);
        console.log(domainConfiguration);
        // Return domain with DNS setup instructions
        const dnsInstructions = domainConfig.generateDNSSetupInstructions(name);

        res.status(201).json({
            domain: newDomain,
            config: domainConfiguration,
            dnsSetup: dnsInstructions
        });
    } catch (error) {
        console.error(`Error adding domain ${name}:`, error);
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
            return res.status(400).json({ error: 'Domain does not exist or invalid' });
        }
        res.status(500).json({ error: 'Failed to add domain' });
    }
});

// Delete a domain
app.delete('/api/domains/:id', (req, res) => {
    const { id } = req.params;

    // Find domain
    const domainIndex = domainsData.domains.findIndex(domain => domain.id === id);

    if (domainIndex === -1) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    // Get domain name to filter out associated emails
    const domainName = domainsData.domains[domainIndex].name;

    // Remove domain
    domainsData.domains.splice(domainIndex, 1);

    // Remove associated emails
    emailsData.emails = emailsData.emails.filter(email => {
        return !email.address.endsWith(`@${domainName}`);
    });

    saveData();

    res.json({ message: 'Domain and associated emails deleted successfully' });
});

// Get all emails
app.get('/api/emails', (req, res) => {
    res.json(emailsData);
});

// Add a new email
app.post('/api/emails', (req, res) => {
    const { address, password, name } = req.body;

    if (!address || !password) {
        return res.status(400).json({ error: 'Email address and password are required' });
    }

    // Check email format
    if (!address.includes('@')) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if domain exists
    const domain = address.split('@')[1];
    if (!domainsData.domains.some(d => d.name === domain)) {
        return res.status(400).json({ error: 'Domain not configured in the system' });
    }

    // Check if email already exists
    if (emailsData.emails.some(email => email.address === address)) {
        return res.status(400).json({ error: 'Email already exists' });
    }

    // Add new email
    const newEmail = {
        id: Date.now().toString(),
        address,
        password,
        name: name || '',
        createdAt: new Date().toISOString()
    };

    emailsData.emails.push(newEmail);
    saveData();

    // Create a directory for this email's messages
    const userDir = path.join(MESSAGES_DIR, address);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir);
    }

    res.status(201).json({ ...newEmail, password: undefined });
});

// Delete an email
app.delete('/api/emails/:id', (req, res) => {
    const { id } = req.params;

    // Find email
    const emailIndex = emailsData.emails.findIndex(email => email.id === id);

    if (emailIndex === -1) {
        return res.status(404).json({ error: 'Email not found' });
    }

    // Get email address to delete messages
    const emailAddress = emailsData.emails[emailIndex].address;

    // Remove email
    emailsData.emails.splice(emailIndex, 1);
    saveData();

    // Delete email's messages directory
    const userDir = path.join(MESSAGES_DIR, emailAddress);
    if (fs.existsSync(userDir)) {
        // In a production app, you'd want to use a recursive delete with proper error handling
        try {
            const files = fs.readdirSync(userDir);
            for (const file of files) {
                fs.unlinkSync(path.join(userDir, file));
            }
            fs.rmdirSync(userDir);
        } catch (err) {
            console.error(`Error deleting messages for ${emailAddress}:`, err);
        }
    }

    res.json({ message: 'Email and associated messages deleted successfully' });
});

// Email authentication
app.post('/api/auth', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = emailsData.emails.find(u => u.address === email && u.password === password);

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ ...user, password: undefined });
});

// Get messages for an email
app.get('/api/messages/:email', (req, res) => {
    const { email } = req.params;

    // Check if email exists
    const emailExists = emailsData.emails.some(e => e.address === email);
    if (!emailExists) {
        return res.status(404).json({ error: 'Email not found' });
    }

    // Get messages from the user's directory
    const userDir = path.join(MESSAGES_DIR, email);
    if (!fs.existsSync(userDir)) {
        return res.json({ messages: [] });
    }

    try {
        const messageFiles = fs.readdirSync(userDir);
        const messages = messageFiles.map(file => {
            return JSON.parse(fs.readFileSync(path.join(userDir, file), 'utf8'));
        });

        // Sort by date, newest first
        messages.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ messages });
    } catch (err) {
        console.error(`Error reading messages for ${email}:`, err);
        res.status(500).json({ error: 'Error reading messages' });
    }
});

// Send a new email
app.post('/api/send', async (req, res) => {
    const { from, to, subject, text, html } = req.body;

    if (!from || !to || !subject) {
        return res.status(400).json({ error: 'From, to, and subject are required' });
    }

    // Check if sender email exists in our system
    const senderExists = emailsData.emails.some(e => e.address === from);
    if (!senderExists) {
        return res.status(404).json({ error: 'Sender email not found' });
    }

    // Get domain from sender email
    const fromDomain = from.split('@')[1];

    // Check if domain is configured
    const domainCfg = domainConfig.getDomainConfigByName(fromDomain);
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
    setupTransporter(fromDomain);

    try {
        // Send email with proper headers
        const mailOptions = {
            from: {
                name: getEmailByAddress(from)?.name || from.split('@')[0],
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

        const info = await transporter.sendMail(mailOptions);

        // Store in sender's sent items
        const messageId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const messageData = {
            id: messageId,
            messageId: info.messageId,
            from,
            to,
            subject,
            text,
            html,
            date: new Date().toISOString(),
            sent: true
        };
        console.log(messageData);
        // Create sender's sent directory if it doesn't exist
        const sentDir = path.join(MESSAGES_DIR, from, 'sent');
        if (!fs.existsSync(path.join(MESSAGES_DIR, from))) {
            fs.mkdirSync(path.join(MESSAGES_DIR, from));
        }
        if (!fs.existsSync(sentDir)) {
            fs.mkdirSync(sentDir);
        }

        // Save to sent folder
        fs.writeFileSync(
            path.join(sentDir, `${messageId}.json`),
            JSON.stringify(messageData, null, 2)
        );

        // Return successful response with delivery info
        res.json({
            message: 'Email sent successfully',
            id: messageId,
            messageId: info.messageId,
            deliveryInfo: info.response
        });
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).json({ error: 'Failed to send email', details: err.message });
    }
});

// Mark message as read
app.patch('/api/messages/:email/:messageId/read', (req, res) => {
    const { email, messageId } = req.params;

    const messagePath = path.join(MESSAGES_DIR, email, `${messageId}.json`);

    if (!fs.existsSync(messagePath)) {
        return res.status(404).json({ error: 'Message not found' });
    }

    try {
        const messageData = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
        messageData.read = true;

        fs.writeFileSync(messagePath, JSON.stringify(messageData, null, 2));

        res.json({ message: 'Message marked as read' });
    } catch (err) {
        console.error(`Error updating message ${messageId}:`, err);
        res.status(500).json({ error: 'Error updating message' });
    }
});

// Delete a message
app.delete('/api/messages/:email/:messageId', (req, res) => {
    const { email, messageId } = req.params;

    const messagePath = path.join(MESSAGES_DIR, email, `${messageId}.json`);

    if (!fs.existsSync(messagePath)) {
        return res.status(404).json({ error: 'Message not found' });
    }

    try {
        fs.unlinkSync(messagePath);
        res.json({ message: 'Message deleted successfully' });
    } catch (err) {
        console.error(`Error deleting message ${messageId}:`, err);
        res.status(500).json({ error: 'Error deleting message' });
    }
});

// API endpoints for Internet Email Configuration
app.get('/api/email-config', (req, res) => {
    const config = emailConfig.getConfig();
    // Remove sensitive information
    if (config.outbound && config.outbound.relayPassword) {
        config.outbound.relayPassword = '********';
    }
    res.json(config);
});

app.post('/api/email-config', (req, res) => {
    try {
        const newConfig = req.body;
        const updated = emailConfig.updateConfig(newConfig);

        // Remove sensitive information for response
        if (updated.outbound && updated.outbound.relayPassword) {
            updated.outbound.relayPassword = '********';
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update email configuration', details: err.message });
    }
});

app.get('/api/email-config/dns/:domain', async (req, res) => {
    try {
        const { domain } = req.params;
        const dnsCheck = await emailConfig.checkDNSConfiguration(domain);
        res.json(dnsCheck);
    } catch (err) {
        res.status(500).json({ error: 'Failed to check DNS configuration', details: err.message });
    }
});

app.get('/api/email-config/port-check', (req, res) => {
    try {
        const port25Check = emailConfig.checkPort25IsOpen();
        const internetCheck = emailConfig.checkPortIsOpenFromInternet(25);

        res.json({
            local: port25Check,
            internet: internetCheck
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check port', details: err.message });
    }
});

app.post('/api/email-config/postfix/:domain', (req, res) => {
    try {
        const { domain } = req.params;
        const result = emailConfig.configurePostfix(domain);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to configure Postfix', details: err.message });
    }
});
// Thêm endpoint này vào server.js
app.post('/api/email-config/postfix/:domain/apply', async (req, res) => {
    try {
        const { domain } = req.params;
        const forceRestart = req.query.restart === 'true';

        const result = await emailConfig.applyPostfixConfig(domain, forceRestart);
        res.json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Failed to apply Postfix configuration',
            details: err.message
        });
    }
});
app.get('/api/email-config/inbound-guide', (req, res) => {
    try {
        const guide = emailConfig.generateInboundEmailInstructions();
        res.json(guide);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate guide', details: err.message });
    }
});

// Start servers
const PORT = process.env.PORT || 2053;
const SMTP_PORT = process.env.SMTP_PORT || 25;

// Start HTTP server
app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
});

// Start SMTP server
smtpServer.listen(SMTP_PORT, () => {
    console.log(`SMTP server running on port ${SMTP_PORT}`);
    setupTransporter();
});