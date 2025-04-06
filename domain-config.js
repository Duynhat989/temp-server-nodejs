// domain-config.js
// Module để quản lý cấu hình domain và hướng dẫn cài đặt DNS

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Đường dẫn lưu trữ dữ liệu
const DATA_DIR = path.join(__dirname, 'data');
const DOMAINS_CONFIG_FILE = path.join(DATA_DIR, 'domain_configs.json');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Khởi tạo file cấu hình nếu chưa tồn tại
if (!fs.existsSync(DOMAINS_CONFIG_FILE)) {
    fs.writeFileSync(DOMAINS_CONFIG_FILE, JSON.stringify({ domains: [] }));
}

// Load dữ liệu cấu hình
let domainConfigsData = JSON.parse(fs.readFileSync(DOMAINS_CONFIG_FILE, 'utf8'));

// Lưu dữ liệu cấu hình
function saveConfigData() {
    fs.writeFileSync(DOMAINS_CONFIG_FILE, JSON.stringify(domainConfigsData, null, 2));
}

// Tạo khóa DKIM ngẫu nhiên
function generateDKIMKeys() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
}

// Xử lý khóa công khai DKIM cho cấu hình DNS
function formatDKIMPublicKeyForDNS(publicKey) {
    return publicKey
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\n/g, '')
        .trim();
}

// Tạo cấu hình mới cho domain
function createDomainConfig(domainName) {
    const serverHostname = os.hostname();
    const serverIP = getServerIP();
    console.log(`Server Hostname: ${serverIP}`);
    // Tạo khóa DKIM
    const { publicKey, privateKey } = generateDKIMKeys();

    // Tạo selector DKIM (thường là timestamp để đảm bảo tính duy nhất)
    const dkimSelector = `mail${Date.now()}`;
    console.log(`Server Hostname: ${publicKey}`);
    console.log(`Server Hostname: ${privateKey}`);

    // Tạo cấu hình mới
    const newConfig = {
        id: Date.now().toString(),
        domainName,
        serverHostname,
        serverIP,
        dkimSelector,
        dkimPrivateKey: privateKey,
        dkimPublicKey: publicKey,
        createdAt: new Date().toISOString(),
        active: true,
        dnsRecords: {
            mx: `${domainName}. 10 ${serverHostname}.`,
            spf: `${domainName}. IN TXT "v=spf1 mx a ip4:${serverIP} ~all"`,
            dkim: `${dkimSelector}._domainkey.${domainName}. IN TXT "v=DKIM1; k=rsa; p=${formatDKIMPublicKeyForDNS(publicKey)}"`,
            dmarc: `_dmarc.${domainName}. IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainName}"`
        }
    };

    // Lưu cấu hình
    domainConfigsData.domains.push(newConfig);
    saveConfigData();

    return newConfig;
}

// Lấy địa chỉ IP của server (phiên bản đơn giản)
function getServerIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Bỏ qua loopback và non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback nếu không tìm thấy
}

// Lấy cấu hình domain theo tên
function getDomainConfigByName(domainName) {
    return domainConfigsData.domains.find(domain => domain.domainName === domainName);
}

// Lấy tất cả cấu hình domain
function getAllDomainConfigs() {
    return domainConfigsData.domains;
}

// Cập nhật trạng thái kích hoạt của domain
function updateDomainActiveStatus(domainName, isActive) {
    const domain = getDomainConfigByName(domainName);
    if (domain) {
        domain.active = isActive;
        saveConfigData();
        return true;
    }
    return false;
}

// Xóa cấu hình domain
function deleteDomainConfig(domainName) {
    const index = domainConfigsData.domains.findIndex(domain => domain.domainName === domainName);
    if (index !== -1) {
        domainConfigsData.domains.splice(index, 1);
        saveConfigData();
        return true;
    }
    return false;
}

// Tạo hướng dẫn cài đặt DNS dựa trên cấu hình
function generateDNSSetupInstructions(domainName) {
    const config = getDomainConfigByName(domainName);
    if (!config) {
        return null;
    }

    return {
        domain: domainName,
        instructions: `
# Hướng dẫn cài đặt DNS cho domain ${domainName}

Để máy chủ email của bạn hoạt động chính xác với domain ${domainName}, hãy thêm các bản ghi DNS sau đây tại nhà cung cấp DNS của bạn:

## Bản ghi MX (Mail Exchange)
Bản ghi này xác định máy chủ email cho domain của bạn.

\`\`\`
${config.dnsRecords.mx}
\`\`\`

## Bản ghi SPF (Sender Policy Framework)
Bản ghi này xác định máy chủ nào được phép gửi email từ domain của bạn.

\`\`\`
${config.dnsRecords.spf}
\`\`\`

## Bản ghi DKIM (DomainKeys Identified Mail)
Bản ghi này cung cấp chữ ký số cho email gửi đi từ domain của bạn.

\`\`\`
${config.dnsRecords.dkim}
\`\`\`

## Bản ghi DMARC (Domain-based Message Authentication, Reporting, and Conformance)
Bản ghi này chỉ định cách xử lý email không xác thực được.

\`\`\`
${config.dnsRecords.dmarc}
\`\`\`

## Bản ghi A và PTR (Reverse DNS)
Đảm bảo rằng địa chỉ IP của máy chủ (${config.serverIP}) có bản ghi PTR trỏ đến tên máy chủ (${config.serverHostname}).

Sau khi cài đặt các bản ghi DNS, có thể mất đến 24-48 giờ để các thay đổi được lan truyền trên toàn cầu.
        `
    };
}

// Xuất các hàm
module.exports = {
    createDomainConfig,
    getDomainConfigByName,
    getAllDomainConfigs,
    updateDomainActiveStatus,
    deleteDomainConfig,
    generateDNSSetupInstructions
};