/**
 * Structured logger using Pino
 */

const pino = require('pino');
const fs = require('fs');
const path = require('path');

let logger;

/**
 * Initialize the logger
 */
function initializeLogger(config) {
  const logDir = path.dirname(config.logging.destination);
  
  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const pinoConfig = {
    level: config.logging.level || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname'
            }
          }
        : undefined
  };

  logger = pino(pinoConfig);

  return logger;
}

/**
 * Get logger instance
 */
function getLogger() {
  if (!logger) {
    logger = pino({
      level: process.env.LOG_LEVEL || 'info'
    });
  }
  return logger;
}

module.exports = {
  initializeLogger,
  getLogger
};
