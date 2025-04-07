// Message model using Sequelize
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Message extends Model {
  // Define model associations
  static associate(models) {
    // Message belongs to sender Email
    Message.belongsTo(models.Email, {
      foreignKey: 'fromEmail',
      targetKey: 'address',
      as: 'sender'
    });
    
    // Message belongs to recipient Email
    Message.belongsTo(models.Email, {
      foreignKey: 'toEmail',
      targetKey: 'address',
      as: 'recipient'
    });
  }
}

// Initialize Message model
Message.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  messageId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'SMTP Message-ID header'
  },
  fromEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  toEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  subject: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  textContent: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  htmlContent: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the message was sent from our system'
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  headers: {
    type: DataTypes.JSON,
    allowNull: true
  },
  hasAttachments: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('received', 'sent', 'failed', 'queued'),
    defaultValue: 'received'
  }
}, {
  sequelize,
  modelName: 'message',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: 'idx_message_from_email',
      fields: ['from_email']
    },
    {
      name: 'idx_message_to_email',
      fields: ['to_email']
    },
    {
      name: 'idx_message_created_at',
      fields: ['created_at']
    }
  ]
});

// Static methods
Message.getMessagesForEmail = async function(email, options = {}) {
  const { limit = 50, offset = 0, unreadOnly = false, sort = 'desc' } = options;
  
  const query = {
    where: {
      toEmail: email,
      ...(unreadOnly ? { read: false } : {})
    },
    order: [['createdAt', sort.toUpperCase()]],
    limit,
    offset
  };
  
  return this.findAndCountAll(query);
};

Message.getSentMessagesForEmail = async function(email, options = {}) {
  const { limit = 50, offset = 0, sort = 'desc' } = options;
  
  const query = {
    where: {
      fromEmail: email,
      sent: true
    },
    order: [['createdAt', sort.toUpperCase()]],
    limit,
    offset
  };
  
  return this.findAndCountAll(query);
};

module.exports = Message;