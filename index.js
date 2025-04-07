/**
 * Email Server - Main Application Entry Point (Sequelize Version)
 * 
 * This file initializes the express application, connects to the database,
 * initializes Sequelize models, sets up middleware, routes, and starts the servers.
 */

// Core dependencies
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Database connection
const { testConnection, initDatabase } = require('./config/database');

// Services
const smtpService = require('./services/smtp-service');
const emailService = require('./services/email-service');

// Routes
const domainRoutes = require('./routes/domain-routes');
const emailRoutes = require('./routes/email-routes');
const messageRoutes = require('./routes/message-routes');
const configRoutes = require('./routes/config-routes');

// Initialize Express app
const app = express();

// Set up middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors()); // Enable CORS
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Logging
const logFormat = process.env.NODE_ENV === 'production' 
  ? 'combined' 
  : 'dev';
app.use(morgan(logFormat));

// Serve static files if needed
app.use('/public', express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/domains', domainRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/email-config', configRoutes);

// Auth and email sending routes
app.post('/api/auth', emailRoutes.authenticate);
app.post('/api/send', messageRoutes.sendEmail);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Email Server API (Sequelize Version)',
    version: process.env.npm_package_version || '1.0.0',
    status: 'running'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', message: 'The requested resource does not exist' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error(`[${new Date().toISOString()}] Error:`, err);
  
  // Send different error details based on environment
  res.status(statusCode).json({
    error: err.name || 'Server error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

/**
 * Initialize database and start servers
 */
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Cannot connect to database. Server will not start.');
      process.exit(1);
    }

    // Initialize database and models
    await initDatabase();
    console.log('Database and models initialized successfully');

    // Get server IP for logging
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const serverIP = Object.values(networkInterfaces)
      .flat()
      .filter(details => details.family === 'IPv4' && !details.internal)
      .map(details => details.address)[0] || 'localhost';
    
    console.log(`Server Hostname: ${serverIP}`);

    // Start HTTP server
    const PORT = process.env.PORT || 2053;
    const server = app.listen(PORT, () => {
      console.log(`✅ API server running on http://${serverIP}:${PORT}`);
    });

    // Setup SMTP server
    const SMTP_PORT = process.env.SMTP_PORT || 2525;
    const smtpServer = await smtpService.createSMTPServer();
    
    // Start SMTP server
    smtpServer.listen(SMTP_PORT, () => {
      console.log(`✅ SMTP server running on ${serverIP}:${SMTP_PORT}`);
      emailService.setupTransporter();
    });

    // Graceful shutdown
    setupGracefulShutdown(server, smtpServer);
    
    return { httpServer: server, smtpServer };
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(httpServer, smtpServer) {
  // Handle process termination gracefully
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    
    // Close HTTP server
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
    
    // Close SMTP server
    smtpServer.close(() => {
      console.log('SMTP server closed');
    });
    
    // Close database connections
    try {
      const { sequelize } = require('./config/database');
      await sequelize.close();
      console.log('Database connections closed');
    } catch (err) {
      console.error('Error closing database connections:', err);
    }
    
    // Exit with success code
    setTimeout(() => {
      console.log('Exiting process');
      process.exit(0);
    }, 1000);
  };

  // Attach signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION');
  });
}

// Only start the server if this file is run directly
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Export for testing
module.exports = { app, startServer };