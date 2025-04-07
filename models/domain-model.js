// Domain model using Sequelize
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Domain extends Model {
  // Define model associations
  static associate(models) {
    // Domain has many Emails
    Domain.hasMany(models.Email, {
      foreignKey: 'domainId',
      as: 'emails',
      onDelete: 'CASCADE'
    });
    
    // Domain has one DomainConfig
    Domain.hasOne(models.DomainConfig, {
      foreignKey: 'domainName',
      sourceKey: 'name',
      as: 'config',
      onDelete: 'CASCADE'
    });
  }
  
  // Custom instance methods
  async getFullDetails() {
    const config = await this.getConfig();
    const emails = await this.getEmails();
    
    return {
      ...this.toJSON(),
      config: config ? config.toJSON() : null,
      emails: emails.map(email => ({
        id: email.id,
        address: email.address,
        name: email.name
      }))
    };
  }
}

// Initialize Domain model
Domain.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isValidDomain(value) {
        const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
        if (!domainRegex.test(value)) {
          throw new Error('Invalid domain name format');
        }
      }
    }
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  sequelize,
  modelName: 'domain',
  timestamps: true, // Adds createdAt and updatedAt automatically
  underscored: true // Uses snake_case for column names
});

module.exports = Domain;