// backend/utils/helpers.js

/**
 * Utility functions for the backend
 */

/**
 * Generate a unique session ID
 * @returns {string} Unique session identifier
 */
 const generateSessionId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `session_${timestamp}_${random}`;
  };
  
  /**
   * Validate file type based on extension and mime type
   * @param {Object} file - Multer file object
   * @returns {boolean} True if valid
   */
  const isValidFileType = (file) => {
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    return allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension);
  };
  
  /**
   * Format bytes to human readable size
   * @param {number} bytes - Size in bytes
   * @returns {string} Human readable size
   */
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  /**
   * Sanitize filename for safe storage
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  const sanitizeFilename = (filename) => {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  };
  
  /**
   * Check if value is a valid number
   * @param {*} value - Value to check
   * @returns {boolean} True if valid number
   */
  const isValidNumber = (value) => {
    return !isNaN(parseFloat(value)) && isFinite(value);
  };
  
  /**
   * Check if value looks like a date
   * @param {*} value - Value to check
   * @returns {boolean} True if looks like a date
   */
  const isValidDate = (value) => {
    if (!value) return false;
    
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
  };
  
  /**
   * Parse and clean CSV/Excel data value
   * @param {*} value - Raw value from file
   * @returns {*} Cleaned value
   */
  const cleanDataValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    // If it's already a number, return it
    if (typeof value === 'number') {
      return value;
    }
    
    // Convert to string and trim
    const stringValue = String(value).trim();
    
    // Try to parse as number
    if (isValidNumber(stringValue)) {
      return parseFloat(stringValue);
    }
    
    // Check if it's a date
    if (isValidDate(stringValue)) {
      return stringValue;
    }
    
    // Return as string
    return stringValue;
  };
  
  /**
   * Calculate statistics for a numeric column
   * @param {Array} values - Array of numeric values
   * @returns {Object} Statistics object
   */
  const calculateColumnStats = (values) => {
    const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
    
    if (numericValues.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        median: 0
      };
    }
    
    const sorted = numericValues.sort((a, b) => a - b);
    const sum = numericValues.reduce((acc, val) => acc + val, 0);
    const avg = sum / numericValues.length;
    
    let median;
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      median = (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      median = sorted[mid];
    }
    
    return {
      count: numericValues.length,
      sum,
      avg,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median
    };
  };
  
  /**
   * Group array of objects by a key
   * @param {Array} array - Array to group
   * @param {string} key - Key to group by
   * @returns {Object} Grouped object
   */
  const groupBy = (array, key) => {
    return array.reduce((groups, item) => {
      const group = item[key] || 'Unknown';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
      return groups;
    }, {});
  };
  
  /**
   * Create a standardized API response
   * @param {boolean} success - Success status
   * @param {*} data - Response data
   * @param {string} message - Response message
   * @returns {Object} Standardized response
   */
  const createResponse = (success, data = null, message = null) => {
    const response = { success };
    
    if (data !== null) {
      response.data = data;
    }
    
    if (message) {
      response.message = message;
    }
    
    return response;
  };
  
  /**
   * Log with timestamp and level
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Log message
   * @param {*} data - Additional data to log
   */
  const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    console[level](logMessage, data || '');
  };
  
  /**
   * Validate required environment variables
   * @param {Array} requiredVars - Array of required variable names
   * @throws {Error} If required variables are missing
   */
  const validateEnvVars = (requiredVars) => {
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  };
  
  /**
   * Safely parse JSON with fallback
   * @param {string} jsonString - JSON string to parse
   * @param {*} fallback - Fallback value
   * @returns {*} Parsed object or fallback
   */
  const safeJsonParse = (jsonString, fallback = null) => {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return fallback;
    }
  };
  
  /**
   * Create a delay/sleep function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };
  
  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in ms
   * @returns {Promise} Promise that resolves with function result
   */
  const retry = async (fn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i === maxRetries) {
          throw lastError;
        }
        
        const delayMs = baseDelay * Math.pow(2, i);
        await delay(delayMs);
      }
    }
  };
  
  module.exports = {
    generateSessionId,
    isValidFileType,
    formatBytes,
    sanitizeFilename,
    isValidNumber,
    isValidDate,
    cleanDataValue,
    calculateColumnStats,
    groupBy,
    createResponse,
    log,
    validateEnvVars,
    safeJsonParse,
    delay,
    retry
  };