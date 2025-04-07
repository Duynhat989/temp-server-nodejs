// network-utils.js
// Module cung cấp các tiện ích mạng cho hệ thống email

const { execSync } = require('child_process');
const os = require('os');

// Lấy IP của server
function getServerIP() {
    try {
        // Tìm IP không phải loopback (127.0.0.1)
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    } catch (err) {
        console.error('Lỗi khi lấy IP server:', err);
        return '127.0.0.1';
    }
}

// Kiểm tra kết nối đến SMTP server từ xa
async function testOutboundSMTP(host, port, username, password, useTLS) {
    // Sử dụng openssl để kiểm tra kết nối
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

// Kiểm tra kết nối internet
function checkInternetConnection() {
    try {
        // Ping Google DNS để kiểm tra kết nối internet
        const result = execSync('ping -c 1 8.8.8.8', { timeout: 5000 }).toString();
        return {
            connected: true,
            latency: extractPingLatency(result),
            details: result.substring(0, 200) // Chỉ lấy 200 ký tự đầu
        };
    } catch (err) {
        return {
            connected: false,
            error: err.message
        };
    }
}

// Trích xuất độ trễ từ kết quả ping
function extractPingLatency(pingResult) {
    try {
        const match = pingResult.match(/time=([0-9.]+) ms/);
        if (match && match[1]) {
            return parseFloat(match[1]);
        }
        return null;
    } catch (err) {
        return null;
    }
}

// Kiểm tra dns resolver
function checkDNSResolver() {
    try {
        // Kiểm tra nội dung file resolv.conf
        const result = execSync('cat /etc/resolv.conf').toString();
        const nameservers = result
            .split('\n')
            .filter(line => line.trim().startsWith('nameserver'))
            .map(line => line.split('nameserver')[1].trim());
        
        return {
            success: nameservers.length > 0,
            nameservers,
            resolv_conf: result
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

// Kiểm tra tốc độ kết nối mạng
function checkNetworkSpeed() {
    try {
        // Thử tải một file nhỏ từ Google để kiểm tra tốc độ
        const startTime = Date.now();
        execSync('curl -s -o /dev/null https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png');
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // chuyển đổi sang giây
        
        return {
            success: true,
            downloadTime: duration,
            downloadSpeed: duration > 0 ? (272 * 92 * 4) / 1024 / duration : 0, // KB/s ước tính
            unit: 'KB/s'
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

// Kiểm tra cấu hình mạng
function getNetworkConfiguration() {
    try {
        const interfaces = os.networkInterfaces();
        const config = {};
        
        // Lấy thông tin về các giao diện mạng
        for (const [name, nets] of Object.entries(interfaces)) {
            config[name] = nets.map(net => ({
                address: net.address,
                netmask: net.netmask,
                family: net.family,
                mac: net.mac,
                internal: net.internal,
                cidr: net.cidr
            }));
        }
        
        // Thêm các thông tin khác
        config.hostname = os.hostname();
        config.defaultGateway = getDefaultGateway();
        
        return {
            success: true,
            config
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

// Lấy default gateway
function getDefaultGateway() {
    try {
        // Cách lấy default gateway trên Linux
        const routeOutput = execSync('ip route | grep default').toString();
        const match = routeOutput.match(/default via ([0-9.]+)/);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    } catch (err) {
        return null;
    }
}

module.exports = {
    getServerIP,
    testOutboundSMTP,
    checkPort25IsOpen,
    checkPortIsOpenFromInternet,
    checkInternetConnection,
    checkDNSResolver,
    checkNetworkSpeed,
    getNetworkConfiguration
};