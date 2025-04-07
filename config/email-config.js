// email-config.js
// Module cấu hình và kiểm tra kết nối email internet

const dns = require('dns').promises;
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
        }
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

// Kiểm tra cấu hình DNS
async function checkDNSConfiguration(domain) {
    try {
        const results = {
            domain,
            checks: {
                mx: { status: 'unchecked', records: [] },
                spf: { status: 'unchecked', records: [] },
                dkim: { status: 'unchecked', records: [] },
                dmarc: { status: 'unchecked', records: [] },
                ptr: { status: 'unchecked', records: [] }
            }
        };

        // Kiểm tra MX
        try {
            const mxRecords = await dns.resolveMx(domain);
            results.checks.mx.records = mxRecords;
            results.checks.mx.status = mxRecords.length > 0 ? 'ok' : 'missing';
        } catch (err) {
            results.checks.mx.status = 'error';
            results.checks.mx.error = err.code;
        }

        // Kiểm tra SPF
        try {
            const txtRecords = await dns.resolveTxt(domain);
            const spfRecords = txtRecords.filter(record =>
                record.join('').startsWith('v=spf1')
            );

            results.checks.spf.records = spfRecords.map(r => r.join(''));
            results.checks.spf.status = spfRecords.length > 0 ? 'ok' : 'missing';
        } catch (err) {
            results.checks.spf.status = 'error';
            results.checks.spf.error = err.code;
        }

        // Kiểm tra DMARC
        try {
            const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
            const validDmarc = dmarcRecords.filter(record =>
                record.join('').startsWith('v=DMARC1')
            );

            results.checks.dmarc.records = dmarcRecords.map(r => r.join(''));
            results.checks.dmarc.status = validDmarc.length > 0 ? 'ok' : 'missing';
        } catch (err) {
            if (err.code === 'ENOTFOUND') {
                results.checks.dmarc.status = 'missing';
            } else {
                results.checks.dmarc.status = 'error';
                results.checks.dmarc.error = err.code;
            }
        }

        // Kiểm tra DKIM (cần selector)
        // Đây là phiên bản đơn giản, trong thực tế cần biết selector
        try {
            // Giả sử selector là 'mail' hoặc 'default'
            const selectors = ['mail', 'default', 'dkim', 'selector1'];
            let dkimFound = false;

            for (const selector of selectors) {
                try {
                    const dkimRecords = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
                    if (dkimRecords.length > 0) {
                        results.checks.dkim.records.push(...dkimRecords.map(r => r.join('')));
                        dkimFound = true;
                    }
                } catch (e) {
                    // Continue checking other selectors
                }
            }

            results.checks.dkim.status = dkimFound ? 'ok' : 'missing';
        } catch (err) {
            results.checks.dkim.status = 'error';
            results.checks.dkim.error = err.code;
        }

        // Kiểm tra PTR record (reverse DNS)
        try {
            const serverIP = getServerIP();
            const ptrRecords = await dns.reverse(serverIP);
            results.checks.ptr.records = ptrRecords;
            results.checks.ptr.status = ptrRecords.length > 0 ? 'ok' : 'missing';
        } catch (err) {
            results.checks.ptr.status = 'error';
            results.checks.ptr.error = err.code;
        }

        // Tính điểm sức khỏe DNS
        let totalChecks = 0;
        let passedChecks = 0;

        for (const check of Object.values(results.checks)) {
            if (check.status !== 'unchecked') {
                totalChecks++;
                if (check.status === 'ok') {
                    passedChecks++;
                }
            }
        }

        results.healthScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

        return results;
    } catch (err) {
        console.error(`Error checking DNS for ${domain}:`, err);
        return {
            domain,
            error: err.message,
            healthScore: 0
        };
    }
}

// Kiểm tra kết nối đến SMTP server từ xa
async function testOutboundSMTP(host, port, username, password, useTLS) {
    // Sử dụng telnet hoặc openssl để kiểm tra kết nối
    try {
        let command;

        if (useTLS) {
            command = `openssl s_client -connect ${host}:${port} -starttls smtp -crlf -quiet`;
        } else {
            command = `openssl s_client -connect ${host}:${port} -crlf -quiet`;
        }

        // Thời gian chờ 5 giây
        const result = execSync(command, { timeout: 5000 }).toString();

        return {
            success: result.includes('250'),
            details: result.substring(0, 500) // Chỉ lấy 500 ký tự đầu
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

// Lấy IP của server
function getServerIP() {
    try {
        // Đây là phiên bản đơn giản, trong thực tế cần kiểm tra IP public
        const interfaces = require('os').networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    } catch (err) {
        console.error('Error getting server IP:', err);
        return '127.0.0.1';
    }
}

// Kiểm tra cổng 25 đã mở chưa
function checkPort25IsOpen() {
    try {
        // Kiểm tra cổng 25 đã mở chưa
        const result = execSync('nc -z -v -w5 localhost 25 2>&1').toString();
        return {
            isOpen: result.includes('succeeded') || result.includes('open'),
            details: result
        };
    } catch (err) {
        return {
            isOpen: false,
            error: err.message
        };
    }
}

// Kiểm tra cổng đã mở cho internet
function checkPortIsOpenFromInternet(port) {
    try {
        const serverIP = getServerIP();

        // Sử dụng dịch vụ kiểm tra cổng từ xa
        const checkCommand = `curl -s "https://portchecker.co/check" -d "port=${port}&target=${serverIP}"`;
        const result = execSync(checkCommand).toString();

        return {
            isOpen: result.includes('Port is open') || result.includes('success'),
            serverIP,
            port,
            details: result.substring(0, 200) // Chỉ lấy 200 ký tự đầu
        };
    } catch (err) {
        return {
            isOpen: false,
            error: err.message
        };
    }
}

// Kiểm tra cấu hình postfix
// Kiểm tra cấu hình postfix
function checkPostfixConfig() {
    try {
        // Thay vì thực thi lệnh postfix, kiểm tra sự tồn tại của các file cấu hình
        const postfixMainCfExists = fs.existsSync('/etc/postfix/main.cf');
        const postfixDirExists = fs.existsSync('/etc/postfix');
        
        console.log('Postfix check - Directory exists:', postfixDirExists);
        console.log('Postfix check - main.cf exists:', postfixMainCfExists);
        
        if (postfixMainCfExists && postfixDirExists) {
            // Đọc nội dung file main.cf để xác minh
            const mainCfContent = fs.readFileSync('/etc/postfix/main.cf', 'utf8');
            
            return {
                installed: true,
                version: 'Verified via config files',
                configContent: mainCfContent.substring(0, 100) + '...' // Chỉ lấy 100 ký tự đầu
            };
        }
        
        return {
            installed: false,
            error: 'Postfix configuration files not found',
            dirExists: postfixDirExists,
            mainCfExists: postfixMainCfExists
        };
    } catch (err) {
        console.error('Error checking Postfix:', err);
        return {
            installed: false,
            error: err.message
        };
    }
}

// Tự động cấu hình postfix cho domain
function configurePostfix(domain) {
    try {
        const config = getConfig();
        const hostname = config.inbound.hostname || require('os').hostname();

        // Kiểm tra Postfix đã cài đặt chưa
        const postfixStatus = checkPostfixConfig();
        if (!postfixStatus.installed) {
            return {
                success: false,
                error: 'Postfix is not installed',
                instructions: 'Please install Postfix first: sudo apt-get install postfix'
            };
        }

        // Tạo file cấu hình postfix
        // Tạo cấu hình tạm
        const tempConfigFile = path.join(__dirname, 'temp_postfix_config');
        const postfixConfig = `
# Cấu hình Postfix tự động cho ${domain}
myhostname = ${hostname}.${domain}
mydomain = ${domain}
myorigin = $mydomain
inet_interfaces = all
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
relay_domains = 
mail_owner = postfix
setgid_group = postdrop

# Cấu hình TLS
smtpd_use_tls = yes
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_cert_file = /etc/ssl/certs/ssl-cert-snakeoil.pem
smtpd_tls_key_file = /etc/ssl/private/ssl-cert-snakeoil.key
smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache
smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache

# Cấu hình SMTP Auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_security_options = noanonymous
smtpd_sasl_local_domain = $myhostname
broken_sasl_auth_clients = yes

# Cấu hình giới hạn kích thước và kết nối
message_size_limit = ${config.limits.maxMessageSize}
mailbox_size_limit = 0
recipient_delimiter = +
maximal_queue_lifetime = 1d
bounce_queue_lifetime = 1d
smtp_destination_concurrency_limit = 2
smtp_destination_rate_delay = 1s
default_process_limit = 100
smtp_connection_cache_on_demand = yes
smtp_connection_cache_destinations = 
smtp_connection_reuse_time_limit = 300s

# Cấu hình chống spam
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination,
    reject_invalid_hostname,
    reject_unauth_pipelining,
    reject_non_fqdn_recipient,
    reject_unknown_recipient_domain
`;

        // Ghi file cấu hình tạm
        fs.writeFileSync(tempConfigFile, postfixConfig);

        // Tạo lệnh áp dụng cấu hình (trong thực tế cần quyền sudo)
        // const applyCommand = `sudo cp ${tempConfigFile} /etc/postfix/main.cf && sudo postfix reload`;
        // execSync(applyCommand);

        // Xóa file tạm sau khi áp dụng
        // fs.unlinkSync(tempConfigFile);

        return {
            success: true,
            configFile: tempConfigFile,
            instructions: `
To apply this configuration:
1. Copy the configuration file to /etc/postfix/main.cf:
   sudo cp ${tempConfigFile} /etc/postfix/main.cf

2. Reload Postfix:
   sudo postfix reload

3. Check status:
   sudo systemctl status postfix
`
        };
    } catch (err) {
        console.error('Error configuring Postfix:', err);
        return {
            success: false,
            error: err.message
        };
    }
}
// Thêm hàm mới vào email-config.js để áp dụng cấu hình trực tiếp
async function applyPostfixConfig(domain, forceRestart = false) {
    try {
        // Tạo cấu hình
        const configResult = configurePostfix(domain);
        
        if (!configResult.success) {
            return {
                success: false,
                error: "Failed to generate configuration",
                details: configResult
            };
        }
        
        // Đọc file cấu hình tạm
        const configContent = fs.readFileSync(configResult.configFile, 'utf8');
        
        // Sử dụng child_process để chạy lệnh với sudo
        // Lưu ý: Điều này yêu cầu cấu hình sudoers cho phép user chạy node thực thi lệnh cụ thể không cần password
        try {
            // Tạo backup của file cấu hình hiện tại
            const backupCommand = `sudo cp /etc/postfix/main.cf /etc/postfix/main.cf.backup.$(date +%Y%m%d%H%M%S)`;
            execSync(backupCommand);
            
            // Ghi cấu hình mới vào file tạm
            const tempFile = '/tmp/postfix_config_' + Date.now();
            fs.writeFileSync(tempFile, configContent);
            
            // Copy file tạm vào vị trí cấu hình Postfix
            execSync(`sudo cp ${tempFile} /etc/postfix/main.cf`);
            
            // Xóa file tạm
            fs.unlinkSync(tempFile);
            
            // Reload hoặc restart Postfix
            if (forceRestart) {
                execSync('sudo systemctl restart postfix');
            } else {
                execSync('sudo postfix reload');
            }
            
            return {
                success: true,
                message: "Postfix configuration applied successfully",
                reloaded: true
            };
        } catch (err) {
            return {
                success: false,
                error: "Failed to apply configuration",
                command_error: err.message,
                note: "You may need to configure sudo permission for this operation"
            };
        }
    } catch (err) {
        return {
            success: false,
            error: "Failed in configuration process",
            details: err.message
        };
    }
}
// Tạo hướng dẫn cấu hình cho việc nhận email từ internet
function generateInboundEmailInstructions() {
    const config = getConfig();
    const serverIP = getServerIP();
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
    checkDNSConfiguration,
    testOutboundSMTP,
    checkPort25IsOpen,
    checkPortIsOpenFromInternet,
    checkPostfixConfig,
    configurePostfix,
    generateInboundEmailInstructions,
    applyPostfixConfig
};