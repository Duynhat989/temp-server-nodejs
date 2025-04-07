// virtual-domain-manager.js
// Module quản lý virtual domains cho hệ thống email

const fs = require('fs');
const path = require('path');

// Đảm bảo thư mục data tồn tại
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// File cấu hình virtual domains
const VIRTUAL_DOMAINS_FILE = path.join(DATA_DIR, 'virtual_domains.json');

// Khởi tạo file virtual domains nếu chưa tồn tại
if (!fs.existsSync(VIRTUAL_DOMAINS_FILE)) {
    const defaultVirtualDomains = {
        domains: []
    };
    
    fs.writeFileSync(VIRTUAL_DOMAINS_FILE, JSON.stringify(defaultVirtualDomains, null, 2));
}

// Lấy danh sách virtual domains
function getVirtualDomains() {
    return JSON.parse(fs.readFileSync(VIRTUAL_DOMAINS_FILE, 'utf8')).domains;
}

// Lưu danh sách virtual domains
function saveVirtualDomains(domains) {
    fs.writeFileSync(VIRTUAL_DOMAINS_FILE, JSON.stringify({ domains }, null, 2));
    return domains;
}

// Thêm virtual domain mới
function addVirtualDomain(domainInfo) {
    const domains = getVirtualDomains();
    
    // Kiểm tra domain đã tồn tại chưa
    const existingDomainIndex = domains.findIndex(d => d.domainName === domainInfo.domainName);
    
    if (existingDomainIndex >= 0) {
        // Cập nhật domain nếu đã tồn tại
        domains[existingDomainIndex] = {
            ...domains[existingDomainIndex],
            ...domainInfo,
            updatedAt: new Date().toISOString()
        };
    } else {
        // Thêm domain mới
        domains.push({
            ...domainInfo,
            enabled: domainInfo.enabled !== undefined ? domainInfo.enabled : true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    
    return saveVirtualDomains(domains);
}

// Xóa virtual domain
function removeVirtualDomain(domainName) {
    const domains = getVirtualDomains();
    const updatedDomains = domains.filter(d => d.domainName !== domainName);
    
    if (domains.length === updatedDomains.length) {
        return { success: false, error: 'Domain not found' };
    }
    
    saveVirtualDomains(updatedDomains);
    return { success: true, message: `Domain ${domainName} removed successfully` };
}

// Cập nhật trạng thái của virtual domain
function updateVirtualDomainStatus(domainName, enabled) {
    const domains = getVirtualDomains();
    const domainIndex = domains.findIndex(d => d.domainName === domainName);
    
    if (domainIndex < 0) {
        return { success: false, error: 'Domain not found' };
    }
    
    domains[domainIndex].enabled = enabled;
    domains[domainIndex].updatedAt = new Date().toISOString();
    
    saveVirtualDomains(domains);
    return { success: true, message: `Domain ${domainName} status updated successfully` };
}

// Lấy thông tin chi tiết của virtual domain
function getVirtualDomainDetails(domainName) {
    const domains = getVirtualDomains();
    const domain = domains.find(d => d.domainName === domainName);
    
    if (!domain) {
        return { success: false, error: 'Domain not found' };
    }
    
    return { success: true, domain };
}

// Tạo hay cập nhật mailbox cho domain
function createMailbox(domainName, username, password) {
    try {
        const domains = getVirtualDomains();
        const domainIndex = domains.findIndex(d => d.domainName === domainName);
        
        if (domainIndex < 0) {
            return {
                success: false,
                error: `Domain ${domainName} not found`
            };
        }
        
        // Kiểm tra và khởi tạo mảng mailboxes nếu chưa có
        if (!domains[domainIndex].mailboxes) {
            domains[domainIndex].mailboxes = [];
        }
        
        const email = `${username}@${domainName}`;
        const mailboxIndex = domains[domainIndex].mailboxes.findIndex(m => m.email === email);
        
        if (mailboxIndex >= 0) {
            // Cập nhật mailbox nếu đã tồn tại
            domains[domainIndex].mailboxes[mailboxIndex] = {
                ...domains[domainIndex].mailboxes[mailboxIndex],
                user: username,
                email: email,
                password: password, // Lưu ý: Trong thực tế nên mã hóa password
                updatedAt: new Date().toISOString()
            };
        } else {
            // Thêm mailbox mới
            domains[domainIndex].mailboxes.push({
                user: username,
                email: email,
                password: password, // Lưu ý: Trong thực tế nên mã hóa password
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        
        saveVirtualDomains(domains);
        return {
            success: true,
            message: `Mailbox ${email} created/updated successfully`
        };
    } catch (err) {
        console.error('Error creating mailbox:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// Xóa mailbox
function removeMailbox(email) {
    try {
        const domains = getVirtualDomains();
        const [username, domainName] = email.split('@');
        
        if (!domainName) {
            return {
                success: false,
                error: 'Invalid email format'
            };
        }
        
        const domainIndex = domains.findIndex(d => d.domainName === domainName);
        
        if (domainIndex < 0) {
            return {
                success: false,
                error: `Domain ${domainName} not found`
            };
        }
        
        if (!domains[domainIndex].mailboxes) {
            return {
                success: false,
                error: 'No mailboxes found for this domain'
            };
        }
        
        const originalLength = domains[domainIndex].mailboxes.length;
        domains[domainIndex].mailboxes = domains[domainIndex].mailboxes.filter(m => m.email !== email);
        
        if (domains[domainIndex].mailboxes.length === originalLength) {
            return {
                success: false,
                error: `Mailbox ${email} not found`
            };
        }
        
        saveVirtualDomains(domains);
        return {
            success: true,
            message: `Mailbox ${email} removed successfully`
        };
    } catch (err) {
        console.error('Error removing mailbox:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// Thêm alias email
function createAlias(domainName, aliasEmail, destinationEmail) {
    try {
        const domains = getVirtualDomains();
        const domainIndex = domains.findIndex(d => d.domainName === domainName);
        
        if (domainIndex < 0) {
            return {
                success: false,
                error: `Domain ${domainName} not found`
            };
        }
        
        // Kiểm tra và khởi tạo mảng aliases nếu chưa có
        if (!domains[domainIndex].aliases) {
            domains[domainIndex].aliases = [];
        }
        
        const aliasIndex = domains[domainIndex].aliases.findIndex(a => a.alias === aliasEmail);
        
        if (aliasIndex >= 0) {
            // Cập nhật alias nếu đã tồn tại
            domains[domainIndex].aliases[aliasIndex] = {
                ...domains[domainIndex].aliases[aliasIndex],
                alias: aliasEmail,
                destination: destinationEmail,
                updatedAt: new Date().toISOString()
            };
        } else {
            // Thêm alias mới
            domains[domainIndex].aliases.push({
                alias: aliasEmail,
                destination: destinationEmail,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        
        saveVirtualDomains(domains);
        return {
            success: true,
            message: `Alias ${aliasEmail} -> ${destinationEmail} created/updated successfully`
        };
    } catch (err) {
        console.error('Error creating alias:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// Xóa alias
function removeAlias(aliasEmail) {
    try {
        const domains = getVirtualDomains();
        const [username, domainName] = aliasEmail.split('@');
        
        if (!domainName) {
            return {
                success: false,
                error: 'Invalid email format'
            };
        }
        
        const domainIndex = domains.findIndex(d => d.domainName === domainName);
        
        if (domainIndex < 0) {
            return {
                success: false,
                error: `Domain ${domainName} not found`
            };
        }
        
        if (!domains[domainIndex].aliases) {
            return {
                success: false,
                error: 'No aliases found for this domain'
            };
        }
        
        const originalLength = domains[domainIndex].aliases.length;
        domains[domainIndex].aliases = domains[domainIndex].aliases.filter(a => a.alias !== aliasEmail);
        
        if (domains[domainIndex].aliases.length === originalLength) {
            return {
                success: false,
                error: `Alias ${aliasEmail} not found`
            };
        }
        
        saveVirtualDomains(domains);
        return {
            success: true,
            message: `Alias ${aliasEmail} removed successfully`
        };
    } catch (err) {
        console.error('Error removing alias:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

module.exports = {
    getVirtualDomains,
    saveVirtualDomains,
    addVirtualDomain,
    removeVirtualDomain,
    updateVirtualDomainStatus,
    getVirtualDomainDetails,
    createMailbox,
    removeMailbox,
    createAlias,
    removeAlias
};