// frontend/src/utils/helpers.js

/**
 * Utility functions for the dashboard application
 */

/**
 * Format large numbers with appropriate suffixes
 * @param {number} value - The number to format
 * @returns {string} Formatted number with suffix
 */
 export const formatLargeNumber = (value) => {
    if (isNaN(value) || !isFinite(value)) {
      return '0';
    }
  
    const absValue = Math.abs(value);
    
    if (absValue >= 1e9) {
      return (value / 1e9).toFixed(1) + 'B';
    } else if (absValue >= 1e6) {
      return (value / 1e6).toFixed(1) + 'M';
    } else if (absValue >= 1e3) {
      return (value / 1e3).toFixed(1) + 'K';
    } else {
      return value.toLocaleString();
    }
  };
  
  /**
   * Format currency values
   * @param {number} value - The number to format as currency
   * @param {string} currency - Currency code (default: USD)
   * @returns {string} Formatted currency string
   */
  export const formatCurrency = (value, currency = 'USD') => {
    if (isNaN(value) || !isFinite(value)) {
      return '$0';
    }
  
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  /**
   * Format percentage values
   * @param {number} value - The number to format as percentage
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted percentage string
   */
  export const formatPercentage = (value, decimals = 1) => {
    if (isNaN(value) || !isFinite(value)) {
      return '0%';
    }
  
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value / 100);
  };
  
  /**
   * Format dates in a readable format
   * @param {string|Date} date - Date to format
   * @returns {string} Formatted date string
   */
  export const formatDate = (date) => {
    if (!date) return 'N/A';
    
    try {
      const dateObj = new Date(date);
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };
  
  /**
   * Debounce function to limit function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };
  
  /**
   * Throttle function to limit function calls
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  export const throttle = (func, limit) => {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };
  
  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Cloned object
   */
  export const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
      return obj.map(item => deepClone(item));
    }
    
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
    
    return obj;
  };
  
  /**
   * Generate a random color
   * @returns {string} Hex color string
   */
  export const generateRandomColor = () => {
    const colors = [
      '#1890ff', '#52c41a', '#fa8c16', '#f5222d', 
      '#722ed1', '#eb2f96', '#13c2c2', '#a0d911',
      '#2f54eb', '#fa541c', '#1890ff', '#52c41a'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };
  
  /**
   * Convert file size to human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Human readable file size
   */
  export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid email
   */
  export const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  /**
   * Get file extension from filename
   * @param {string} filename - The filename
   * @returns {string} File extension
   */
  export const getFileExtension = (filename) => {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
  };
  
  /**
   * Check if file is supported
   * @param {string} filename - The filename
   * @returns {boolean} True if supported
   */
  export const isSupportedFile = (filename) => {
    const supportedExtensions = ['csv', 'xlsx', 'xls'];
    const extension = getFileExtension(filename).toLowerCase();
    return supportedExtensions.includes(extension);
  };
  
  /**
   * Generate unique ID
   * @returns {string} Unique identifier
   */
  export const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };
  
  /**
   * Safely parse JSON
   * @param {string} jsonString - JSON string to parse
   * @param {*} fallback - Fallback value if parsing fails
   * @returns {*} Parsed object or fallback
   */
  export const safeJsonParse = (jsonString, fallback = null) => {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('JSON parsing failed:', error);
      return fallback;
    }
  };
  
  /**
   * Capitalize first letter of string
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  export const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };
  
  /**
   * Convert snake_case to Title Case
   * @param {string} str - String to convert
   * @returns {string} Title case string
   */
  export const snakeToTitle = (str) => {
    if (!str) return '';
    return str
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };
  
  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  export const truncateText = (text, maxLength = 50) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };
  
  /**
   * Check if value is empty (null, undefined, empty string, empty array)
   * @param {*} value - Value to check
   * @returns {boolean} True if empty
   */
  export const isEmpty = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    return false;
  };
  
  /**
   * Sort array of objects by property
   * @param {Array} array - Array to sort
   * @param {string} property - Property to sort by
   * @param {string} direction - 'asc' or 'desc'
   * @returns {Array} Sorted array
   */
  export const sortByProperty = (array, property, direction = 'asc') => {
    return [...array].sort((a, b) => {
      const aVal = a[property];
      const bVal = b[property];
      
      if (direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };
  
  /**
   * Filter array of objects by search term
   * @param {Array} array - Array to filter
   * @param {string} searchTerm - Search term
   * @param {Array} searchFields - Fields to search in
   * @returns {Array} Filtered array
   */
  export const filterBySearch = (array, searchTerm, searchFields = []) => {
    if (!searchTerm) return array;
    
    const term = searchTerm.toLowerCase();
    
    return array.filter(item => {
      if (searchFields.length === 0) {
        // Search in all string properties
        return Object.values(item).some(value => 
          typeof value === 'string' && value.toLowerCase().includes(term)
        );
      } else {
        // Search in specified fields
        return searchFields.some(field => {
          const value = item[field];
          return typeof value === 'string' && value.toLowerCase().includes(term);
        });
      }
    });
  };
  
  /**
   * Create download link for data
   * @param {*} data - Data to download
   * @param {string} filename - Filename
   * @param {string} type - MIME type
   */
  export const downloadData = (data, filename, type = 'application/json') => {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  /**
   * Get contrast color for background
   * @param {string} hexColor - Background color in hex
   * @returns {string} 'black' or 'white'
   */
  export const getContrastColor = (hexColor) => {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? 'black' : 'white';
  };
  
  /**
   * Local storage helpers with error handling
   */
  export const storage = {
    get: (key, defaultValue = null) => {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (error) {
        console.warn('Error reading from localStorage:', error);
        return defaultValue;
      }
    },
    
    set: (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn('Error writing to localStorage:', error);
        return false;
      }
    },
    
    remove: (key) => {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.warn('Error removing from localStorage:', error);
        return false;
      }
    }
  };