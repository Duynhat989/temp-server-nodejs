// Email model using Sequelize
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');

class Email extends Model {
  // Define model associations
  static associate(models) {
    // Email belongs to a Domain
    Email.belongsTo(models.Domain, {
      foreignKey: 'domainId',
      as: 'domain'
    });
    
    // Email has many received messages
    Email.hasMany(models.Message, {
      foreignKey: 'toEmail',
      sourceKey: 'address',
      as: 'receivedMessages',
      scope: {
        sent: false
      }
    });
    
    // Email has many sent messages
    Email.hasMany(models.Message, {
      foreignKey: 'fromEmail',
      sourceKey: 'address',
      as: 'sentMessages',
      scope: {
        sent: true
      }
    });
  }
  
  // Check if password matches
  async validatePassword(password) {
    return bcrypt.compare(password, this.password);
  }
  
  // Custom instance methods
  safeReturn() {
    const { password, ...safeData } = this.toJSON();
    return safeData;
  }
}

// Initialize Email model
Email.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  domainId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'domains',
      key: 'id'
    }
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'email',
  timestamps: true,
  underscored: true,
  hooks: {
    // Hash password before saving
    beforeCreate: async (email) => {
      email.password = await bcrypt.hash(email.password, 10);
    },
    beforeUpdate: async (email) => {
      if (email.changed('password')) {
        email.password = await bcrypt.hash(email.password, 10);
      }
    },
    // Set domain ID from email address if not provided
    beforeValidate: async (email) => {
      if (!email.domainId && email.address) {
        const domain = email.address.split('@')[1];
        if (domain) {
          const Domain = sequelize.models.domain;
          const domainRecord = await Domain.findOne({ where: { name: domain } });
          if (domainRecord) {
            email.domainId = domainRecord.id;
          }
        }
      }
    }
  }
});

// Static methods
Email.authenticate = async function(address, password) {
  const email = await this.findOne({ where: { address } });
  
  if (!email) {
    return null;
  }
  
  const isValid = await email.validatePassword(password);
  
  if (!isValid) {
    return null;
  }
  
  // Update last login time
  await email.update({ lastLogin: new Date() });
  
  return email.safeReturn();
};

module.exports = Email;