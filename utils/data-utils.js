// Data management utilities
const fs = require('fs');
const path = require('path');

// Data storage paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const DOMAINS_FILE = path.join(DATA_DIR, 'domains.json');
const EMAILS_FILE = path.join(DATA_DIR, 'emails.json');
const MESSAGES_DIR = path.join(DATA_DIR, 'messages');

// Ensure data files exist
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

module.exports = {
    DATA_DIR,
    DOMAINS_FILE,
    EMAILS_FILE,
    MESSAGES_DIR,
    domainsData,
    emailsData,
    saveData,
    getEmailByAddress
};