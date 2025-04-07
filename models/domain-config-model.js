// Domain configuration model using Sequelize
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

class DomainConfig extends Model {
  // Define model associations
  static associate(models) {
    // DomainConfig belongs to a Domain
    DomainConfig.belongsTo(models.Domain, {
      foreignKey: 'domainName',
      targetKey: 'name',
      as: 'domain'
    });
  }
  
  // Generate DNS setup instructions
  getDNSInstructions() {
    return {
      dkim: {
        name: `${this.dkimSelector}._domainkey.${this.domainName}`,
        type: 'TXT',
        value: this.dkimTxtRecord,
        description: 'DKIM signature verification'
      },
      spf: {
        name: this.domainName,
        type: 'TXT',
        value: this.spfRecord,
        description: 'SPF record for sender verification'
      },
      mx: {
        name: this.domainName,
        type: 'MX',
        value: `10 mail.${this.domainName}`,
        description: 'Mail exchanger record for receiving emails'
      }
    };
  }
}

// Initialize DomainConfig model
DomainConfig.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  domainName: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    references: {
      model: 'domains',
      key: 'name'
    }
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  dkimSelector: {
    type: DataTypes.STRING,
    allowNull: true
  },
  dkimPublicKey: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dkimPrivateKey: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dkimTxtRecord: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  spfRecord: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dkimVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  spfVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  mxVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  sequelize,
  modelName: 'domain_config',
  timestamps: true,
  underscored: true,
  hooks: {
    // Generate DKIM keys and records before creation
    beforeCreate: async (config) => {
      // Generate DKIM keys
      const keys = generateDKIMKeys();
      const selector = 'mail' + Math.floor(Date.now() / 1000);
      
      config.dkimSelector = selector;
      config.dkimPublicKey = keys.publicKey;
      config.dkimPrivateKey = keys.privateKey;
      config.dkimTxtRecord = generateDKIMTxtRecord(keys.publicKey);
      
      // Generate SPF record
      const serverIP = getServerIP();
      config.spfRecord = `v=spf1 ip4:${serverIP} -all`;
    }
  }
});

// Helper function to generate DKIM keys
function generateDKIMKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
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

  return {
    publicKey: publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, ''),
    privateKey
  };
}

// Helper function to generate DKIM TXT record
function generateDKIMTxtRecord(publicKey) {
  return `v=DKIM1; k=rsa; p=${publicKey}`;
}

// Helper function to get server IP
function getServerIP() {
  try {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    
    const ipAddress = Object.values(networkInterfaces)
      .flat()
      .filter(details => details.family === 'IPv4' && !details.internal)
      .map(details => details.address)[0];
      
    return ipAddress || '127.0.0.1';
  } catch (error) {
    console.error('Error getting server IP:', error);
    return '127.0.0.1';
  }
}

// Static methods
DomainConfig.createForDomain = async function(domainName) {
  try {
    // Check if config already exists
    const existingConfig = await this.findOne({ where: { domainName } });
    if (existingConfig) {
      return existingConfig;
    }
    
    // Create new domain config
    return await this.create({ domainName });
  } catch (error) {
    console.error(`Error creating domain config for ${domainName}:`, error);
    throw error;
  }
};

module.exports = DomainConfig;