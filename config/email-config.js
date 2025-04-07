// email-config.js
// Module cấu hình và kiểm tra kết nối email internet với hỗ trợ nhiều virtual domain

const dns = require('dns').promises;
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const virtualDomainManager = require('./virtual-domain-manager');
const postfixConfig = require('./postfix-config');
const networkUtils = require('./network-utils');

// Đảm bảo thư mục data tồn tại
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// File cấu hình
const CONFIG_FILE = path.join(DATA_DIR, 'internet_email_config.json');

// Khởi tạo file cấu hình nếu chưa tồn tại
if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
        enabled: false,
        inbound: {
            enabled: false,
            port: 25,
            hostname: null,
            requireTLS: true
        },
        outbound: {
            enabled: false,
            relayHost: null,
            relayPort: 587,
            relayUsername: null,
            relayPassword: null,
            useTLS: true
        },
        spamProtection: {
            enabled: true,
            spamAssassinEnabled: false,
            dnsblCheck: true,
            spfCheck: true,
            dkimCheck: true,
            dmarcCheck: true,
            greylistingEnabled: true
        },
        limits: {
            maxMessageSize: 10 * 1024 * 1024, // 10MB
            maxRecipients: 50,
            maxConnections: 20
        },
        // Thêm cấu hình cho virtual domains
        virtualDomainsEnabled: false,
        primaryDomain: null
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
}

// Lấy cấu hình
function getConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Lưu cấu hình
function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return config;
}

// Cập nhật cấu hình
function updateConfig(newConfig) {
    const currentConfig = getConfig();
    const updatedConfig = { ...currentConfig, ...newConfig };
    return saveConfig(updatedConfig);
}

// Tạo hướng dẫn cấu hình cho việc nhận email từ internet
function generateInboundEmailInstructions() {
    const config = getConfig();
    const serverIP = networkUtils.getServerIP();
    const hostname = config.inbound.hostname || require('os').hostname();

    return {
        instructions: `
# Hướng dẫn cấu hình máy chủ email nhận từ internet

## Yêu cầu cơ bản
1. Địa chỉ IP tĩnh (hiện tại: ${serverIP})
2. Tên miền đã cấu hình DNS đúng cách
3. Cổng 25 mở trên tường lửa

## Kiểm tra cổng 25
Kiểm tra xem cổng 25 đã mở chưa bằng cách chạy:
\`\`\`
nc -z -v -w5 localhost 25
\`\`\`

## Cài đặt Postfix
Nếu chưa cài đặt Postfix:
\`\`\`
sudo apt-get update
sudo apt-get install postfix
\`\`\`

Khi được hỏi, chọn 'Internet Site' và nhập tên miền chính của bạn.

## Cấu hình Reverse DNS (PTR)
Liên hệ với nhà cung cấp dịch vụ lưu trữ hoặc ISP để cấu hình bản ghi PTR cho IP ${serverIP} trỏ về ${hostname}.

## Cấu hình SPF, DKIM và DMARC
Đảm bảo đã cấu hình các bản ghi DNS như hướng dẫn trong phần thiết lập domain.

## Kiểm tra cấu hình
Sau khi cấu hình, bạn có thể kiểm tra bằng cách gửi email đến địa chỉ của bạn từ một dịch vụ email khác và kiểm tra log:
\`\`\`
sudo tail -f /var/log/mail.log
\`\`\`
`
    };
}

module.exports = {
    getConfig,
    saveConfig,
    updateConfig,
    generateInboundEmailInstructions,
    checkDNSConfiguration: postfixConfig.checkDNSConfiguration,
    testOutboundSMTP: networkUtils.testOutboundSMTP,
    checkPort25IsOpen: networkUtils.checkPort25IsOpen,
    checkPortIsOpenFromInternet: networkUtils.checkPortIsOpenFromInternet,
    checkPostfixConfig: postfixConfig.checkPostfixConfig,
    configurePostfix: postfixConfig.configurePostfix,
    applyPostfixConfig: postfixConfig.applyPostfixConfig,
    // Xuất các hàm virtual domain
    getVirtualDomains: virtualDomainManager.getVirtualDomains,
    saveVirtualDomains: virtualDomainManager.saveVirtualDomains,
    addVirtualDomain: virtualDomainManager.addVirtualDomain,
    removeVirtualDomain: virtualDomainManager.removeVirtualDomain,
    updateVirtualDomainStatus: virtualDomainManager.updateVirtualDomainStatus,
    getVirtualDomainDetails: virtualDomainManager.getVirtualDomainDetails,
    createVirtualDomainsConfig: postfixConfig.createVirtualDomainsConfig,
    configurePostfixWithVirtualDomains: postfixConfig.configurePostfixWithVirtualDomains,
    createMailbox: virtualDomainManager.createMailbox,
    removeMailbox: virtualDomainManager.removeMailbox,
    createAlias: virtualDomainManager.createAlias,
    removeAlias: virtualDomainManager.removeAlias
};