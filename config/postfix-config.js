// postfix-config.js
// Module xử lý cấu hình Postfix với hỗ trợ virtual domains

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const dns = require('dns').promises;
const networkUtils = require('./network-utils');

// Đường dẫn tới thư mục data
const DATA_DIR = path.join(__dirname, 'data');

// Đường dẫn file cấu hình
const CONFIG_FILE = path.join(DATA_DIR, 'internet_email_config.json');
const VIRTUAL_DOMAINS_FILE = path.join(DATA_DIR, 'virtual_domains.json');

// Hàm lấy cấu hình
function getConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Hàm lấy danh sách virtual domains
function getVirtualDomains() {
    return JSON.parse(fs.readFileSync(VIRTUAL_DOMAINS_FILE, 'utf8')).domains;
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
                    // Tiếp tục kiểm tra các selector khác
                }
            }

            results.checks.dkim.status = dkimFound ? 'ok' : 'missing';
        } catch (err) {
            results.checks.dkim.status = 'error';
            results.checks.dkim.error = err.code;
        }

        // Kiểm tra PTR record (reverse DNS)
        try {
            const serverIP = networkUtils.getServerIP();
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

// Kiểm tra cấu hình postfix
function checkPostfixConfig() {
    try {
        // Kiểm tra sự tồn tại của các file cấu hình
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

// Tạo chuỗi cấu hình virtual domains
function createVirtualDomainsConfig() {
    const domains = getVirtualDomains();
    const config = getConfig();
    const primaryDomain = config.primaryDomain;
    
    if (!domains || domains.length === 0) {
        return {
            success: false,
            error: 'No virtual domains configured'
        };
    }
    
    try {
        // Tạo danh sách domains
        const domainList = domains
            .filter(d => d.enabled)
            .map(d => d.domainName)
            .join(', ');
        
        // Tạo nội dung file virtual_mailbox_domains
        const virtualDomains = domains
            .filter(d => d.enabled)
            .map(d => d.domainName)
            .join('\n');
        
        // Tạo nội dung file virtual_mailbox_maps
        let virtualMailboxes = '';
        let virtualAliases = '';
        
        // Xây dựng danh sách mailbox và alias cho mỗi domain
        domains.filter(d => d.enabled).forEach(domain => {
            if (domain.mailboxes && domain.mailboxes.length > 0) {
                domain.mailboxes.forEach(mailbox => {
                    virtualMailboxes += `${mailbox.email} ${domain.domainName}/${mailbox.user}/\n`;
                });
            }
            
            if (domain.aliases && domain.aliases.length > 0) {
                domain.aliases.forEach(alias => {
                    virtualAliases += `${alias.alias} ${alias.destination}\n`;
                });
            }
        });
        
        // Tạo chuỗi cấu hình cho Postfix
        const postfixConfig = `
# === Virtual Domains Configuration ===
virtual_mailbox_domains = ${domainList}
virtual_mailbox_base = /var/mail/vhosts
virtual_mailbox_maps = hash:/etc/postfix/virtual_mailbox_maps
virtual_alias_maps = hash:/etc/postfix/virtual_alias_maps
virtual_minimum_uid = 100
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000
`;
        
        return {
            success: true,
            postfixConfig,
            virtualDomains,
            virtualMailboxes,
            virtualAliases,
            domainList
        };
    } catch (err) {
        console.error('Error creating virtual domains config:', err);
        return {
            success: false,
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

        // Tạo file cấu hình postfix tạm
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

        return {
            success: true,
            configFile: tempConfigFile,
            instructions: `
Để áp dụng cấu hình này:
1. Sao chép file cấu hình vào /etc/postfix/main.cf:
   sudo cp ${tempConfigFile} /etc/postfix/main.cf

2. Tải lại Postfix:
   sudo postfix reload

3. Kiểm tra trạng thái:
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

// Cấu hình Postfix với virtual domains
function configurePostfixWithVirtualDomains() {
    try {
        const config = getConfig();
        const hostname = config.inbound.hostname || require('os').hostname();
        const primaryDomain = config.primaryDomain;
        
        if (!primaryDomain) {
            return {
                success: false,
                error: 'Primary domain not configured',
                instructions: 'Vui lòng cấu hình domain chính trước bằng updateConfig'
            };
        }
        
        // Kiểm tra Postfix đã cài đặt chưa
        const postfixStatus = checkPostfixConfig();
        if (!postfixStatus.installed) {
            return {
                success: false,
                error: 'Postfix is not installed',
                instructions: 'Vui lòng cài đặt Postfix trước: sudo apt-get install postfix'
            };
        }
        
        // Lấy cấu hình virtual domains
        const virtualDomainsConfig = createVirtualDomainsConfig();
        if (!virtualDomainsConfig.success) {
            return {
                success: false,
                error: 'Không thể tạo cấu hình virtual domains',
                details: virtualDomainsConfig.error
            };
        }
        
        // Tạo file cấu hình postfix
        const tempConfigFile = path.join(__dirname, 'temp_postfix_config');
        const postfixConfig = `
# Cấu hình Postfix tự động cho ${primaryDomain} với virtual domains
myhostname = ${hostname}.${primaryDomain}
mydomain = ${primaryDomain}
myorigin = $mydomain
inet_interfaces = all
# Cấu hình cho primary domain và virtual domains
mydestination = $myhostname, localhost.$mydomain, localhost
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

${virtualDomainsConfig.postfixConfig}
`;

        // Tạo file cấu hình virtual domains
        const virtualDomainsFile = path.join(__dirname, 'temp_virtual_domains');
        const virtualMailboxMapsFile = path.join(__dirname, 'temp_virtual_mailbox_maps');
        const virtualAliasMapsFile = path.join(__dirname, 'temp_virtual_alias_maps');
        
        // Ghi các file cấu hình
        fs.writeFileSync(tempConfigFile, postfixConfig);
        fs.writeFileSync(virtualDomainsFile, virtualDomainsConfig.virtualDomains);
        fs.writeFileSync(virtualMailboxMapsFile, virtualDomainsConfig.virtualMailboxes);
        fs.writeFileSync(virtualAliasMapsFile, virtualDomainsConfig.virtualAliases);

        return {
            success: true,
            configFiles: {
                main: tempConfigFile,
                virtualDomains: virtualDomainsFile,
                virtualMailboxMaps: virtualMailboxMapsFile,
                virtualAliasMaps: virtualAliasMapsFile
            },
            instructions: `
Để áp dụng cấu hình virtual domains này:

1. Tạo thư mục mailbox ảo:
   sudo mkdir -p /var/mail/vhosts
   sudo groupadd -g 5000 vmail
   sudo useradd -u 5000 -g vmail -s /usr/sbin/nologin -d /var/mail/vhosts vmail
   sudo chown -R vmail:vmail /var/mail/vhosts

2. Sao chép các file cấu hình:
   sudo cp ${tempConfigFile} /etc/postfix/main.cf
   sudo cp ${virtualMailboxMapsFile} /etc/postfix/virtual_mailbox_maps
   sudo cp ${virtualAliasMapsFile} /etc/postfix/virtual_alias_maps

3. Tạo các file database:
   sudo postmap /etc/postfix/virtual_mailbox_maps
   sudo postmap /etc/postfix/virtual_alias_maps

4. Tạo thư mục cho từng domain:
   ${virtualDomainsConfig.virtualDomains.split('\n').map(domain => 
       `sudo mkdir -p /var/mail/vhosts/${domain}`
   ).join('\n   ')}
   sudo chown -R vmail:vmail /var/mail/vhosts

5. Tải lại Postfix:
   sudo systemctl reload postfix

6. Kiểm tra trạng thái:
   sudo systemctl status postfix
   sudo tail -f /var/log/mail.log
`
        };
    } catch (err) {
        console.error('Error configuring Postfix with virtual domains:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// Áp dụng cấu hình postfix
async function applyPostfixConfig(domain, forceRestart = false) {
    try {
        // Tạo cấu hình
        const configResult = configurePostfix(domain);
        
        if (!configResult.success) {
            return {
                success: false,
                error: "Không thể tạo cấu hình",
                details: configResult
            };
        }
        
        // Đọc file cấu hình tạm
        const configContent = fs.readFileSync(configResult.configFile, 'utf8');
        
        // Sử dụng child_process để chạy lệnh với sudo
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
                message: "Đã áp dụng cấu hình Postfix thành công",
                reloaded: true
            };
        } catch (err) {
            return {
                success: false,
                error: "Không thể áp dụng cấu hình",
                command_error: err.message,
                note: "Bạn có thể cần phải cấu hình quyền sudo cho thao tác này"
            };
        }
    } catch (err) {
        return {
            success: false,
            error: "Lỗi trong quá trình cấu hình",
            details: err.message
        };
    }
}

// Áp dụng cấu hình virtual domains
async function applyVirtualDomainsConfig(forceRestart = false) {
    try {
        // Tạo cấu hình
        const configResult = configurePostfixWithVirtualDomains();
        
        if (!configResult.success) {
            return {
                success: false,
                error: "Không thể tạo cấu hình virtual domains",
                details: configResult
            };
        }
        
        try {
            // Tạo backup của file cấu hình hiện tại
            const backupCommand = `sudo cp /etc/postfix/main.cf /etc/postfix/main.cf.backup.$(date +%Y%m%d%H%M%S)`;
            execSync(backupCommand);
            
            // Đảm bảo thư mục vmail tồn tại
            execSync(`
                sudo mkdir -p /var/mail/vhosts
                sudo groupadd -g 5000 vmail 2>/dev/null || true
                sudo useradd -u 5000 -g vmail -s /usr/sbin/nologin -d /var/mail/vhosts vmail 2>/dev/null || true
                sudo chown -R vmail:vmail /var/mail/vhosts
            `);
            
            // Copy các file cấu hình
            execSync(`sudo cp ${configResult.configFiles.main} /etc/postfix/main.cf`);
            execSync(`sudo cp ${configResult.configFiles.virtualMailboxMaps} /etc/postfix/virtual_mailbox_maps`);
            execSync(`sudo cp ${configResult.configFiles.virtualAliasMaps} /etc/postfix/virtual_alias_maps`);
            
            // Tạo các file database
            execSync(`sudo postmap /etc/postfix/virtual_mailbox_maps`);
            execSync(`sudo postmap /etc/postfix/virtual_alias_maps`);
            
            // Tạo thư mục cho từng domain
            const domains = getVirtualDomains().filter(d => d.enabled).map(d => d.domainName);
            for (const domain of domains) {
                execSync(`sudo mkdir -p /var/mail/vhosts/${domain}`);
            }
            execSync(`sudo chown -R vmail:vmail /var/mail/vhosts`);
            
            // Reload hoặc restart Postfix
            if (forceRestart) {
                execSync('sudo systemctl restart postfix');
            } else {
                execSync('sudo postfix reload');
            }
            
            return {
                success: true,
                message: "Đã áp dụng cấu hình virtual domains thành công",
                reloaded: true
            };
        } catch (err) {
            return {
                success: false,
                error: "Không thể áp dụng cấu hình virtual domains",
                command_error: err.message,
                note: "Bạn có thể cần phải cấu hình quyền sudo cho thao tác này"
            };
        }
    } catch (err) {
        return {
            success: false,
            error: "Lỗi trong quá trình cấu hình virtual domains",
            details: err.message
        };
    }
}

module.exports = {
    checkDNSConfiguration,
    checkPostfixConfig,
    createVirtualDomainsConfig,
    configurePostfix,
    configurePostfixWithVirtualDomains,
    applyPostfixConfig,
    applyVirtualDomainsConfig
};