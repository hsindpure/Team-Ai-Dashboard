// frontend/src/services/api.js
import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 30000, // 30 seconds timeout
  withCredentials: true
});

// Request interceptor for loading states
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.config.url} - ${response.status}`);
    return response;
  },
  (error) => {
    console.error('❌ Response Error:', error);
    
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      let message = data?.message || 'An error occurred';
      
      switch (status) {
        case 400:
          message = data?.message || 'Invalid request';
          break;
        case 404:
          message = 'Resource not found';
          break;
        case 500:
          message = 'Server error occurred';
          break;
        default:
          message = `Error ${status}: ${message}`;
      }
      
      throw new Error(message);
    } else if (error.request) {
      // Network error
      throw new Error('Network error - please check your connection');
    } else {
      // Request setup error
      throw new Error('Request failed - please try again');
    }
  }
);

// API Functions

/**
 * Upload file to server for processing
 * @param {File} file - The file to upload
 * @returns {Promise} Upload result with session ID
 */
export const uploadFile = async (file) => {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    // Validate file type
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(fileExtension)) {
      throw new Error('Please upload only CSV or Excel files');
    }

    // Validate file size (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('File size must be less than 100MB');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      // Longer timeout for large files
      timeout: 120000 // 2 minutes
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Upload failed');
    }

    return response.data;

  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};

/**
 * Get session data
 * @param {string} sessionId - Session identifier
 * @returns {Promise} Session data
 */
export const getSession = async (sessionId) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const response = await api.get(`/api/session/${sessionId}`);

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get session');
    }

    return response.data;

  } catch (error) {
    console.error('Get session error:', error);
    throw error;
  }
};

/**
 * Get AI suggestions for charts
 * @param {string} sessionId - Session identifier
 * @param {Object} customFilters - Optional custom filters
 * @returns {Promise} AI suggestions
 */
export const suggestCharts = async (sessionId, customFilters = {}) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const response = await api.post('/api/suggest-charts', {
      sessionId,
      customFilters
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get suggestions');
    }

    return response.data;

  } catch (error) {
    console.error('Suggest charts error:', error);
    throw error;
  }
};

/**
 * Generate dashboard with filters
 * @param {string} sessionId - Session identifier
 * @param {Object} filters - Applied filters
 * @param {Array} selectedMeasures - Selected measures for custom charts
 * @param {Array} selectedDimensions - Selected dimensions for custom charts
 * @returns {Promise} Dashboard data
 */
// export const generateDashboard = async (sessionId, filters = {}, selectedMeasures = null, selectedDimensions = null) => {
//   try {
//     if (!sessionId) {
//       throw new Error('Session ID is required');
//     }

//     const requestData = {
//       sessionId,
//       filters
//     };

//     // Add custom selections if provided
//     if (selectedMeasures) {
//       requestData.selectedMeasures = selectedMeasures;
//     }
//     if (selectedDimensions) {
//       requestData.selectedDimensions = selectedDimensions;
//     }

//     const response = await api.post('/api/generate-dashboard', requestData);

//     if (!response.data.success) {
//       throw new Error(response.data.message || 'Failed to generate dashboard');
//     }

//     return response.data;

//   } catch (error) {
//     console.error('Generate dashboard error:', error);
//     throw error;
//   }
// };



// Update your existing generateDashboard function in api.js:
export const generateDashboard = async (
  sessionId, 
  filters = {}, 
  selectedMeasures = null, 
  selectedDimensions = null, 
  dataLimit = null, 
  includeCustomCharts = false,
  userContext = null  // ✅ ADD THIS PARAMETER
) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const requestData = {
      sessionId,
      filters,
      dataLimit,
      userContext 
    };

    // Add custom selections if provided
    if (selectedMeasures) {
      requestData.selectedMeasures = selectedMeasures;
    }
    if (selectedDimensions) {
      requestData.selectedDimensions = selectedDimensions;
    }

    // Choose the appropriate endpoint
    const endpoint = includeCustomCharts 
      ? '/api/generate-dashboard-with-custom' 
      : '/api/generate-dashboard';
    
    if (includeCustomCharts) {
      requestData.includeCustomCharts = true;
    }

    console.log('🎯 Generating dashboard with user context:', {
      sessionId,
      hasContext: !!userContext,
      contextLength: userContext?.length || 0
    });

    if (userContext) {
      console.log('🎯 Generating dashboard with user context:', {
        sessionId,
        hasContext: true,
        contextLength: userContext.length
      });
    } else {
      console.log('🎯 Generating dashboard with automatic analysis');
    }

    const response = await api.post(endpoint, requestData);

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to generate dashboard');
    }

    return response.data;

  } catch (error) {
    console.error('Generate dashboard error:', error);
    throw error;
  }
};

/**
 * Get custom chart combinations from AI
 * @param {string} sessionId - Session identifier
 * @param {Array} selectedMeasures - Selected measures
 * @param {Array} selectedDimensions - Selected dimensions
 * @param {Object} activeFilters - Current active filters
 * @returns {Promise} Chart combinations
 */
export const getCustomChartCombinations = async (sessionId, selectedMeasures, selectedDimensions, activeFilters = {}) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!selectedMeasures || selectedMeasures.length === 0) {
      throw new Error('At least one measure must be selected');
    }

    if (!selectedDimensions || selectedDimensions.length === 0) {
      throw new Error('At least one dimension must be selected');
    }

    console.log('🚀 Requesting custom chart combinations:', {
      sessionId,
      selectedMeasures,
      selectedDimensions,
      activeFilters
    });

    const response = await api.post('/api/custom-chart-combinations', {
      sessionId,
      selectedMeasures,
      selectedDimensions,
      activeFilters
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get chart combinations');
    }

    console.log('✅ Custom chart combinations received:', response.data);
    return response.data;

  } catch (error) {
    console.error('Get custom chart combinations error:', error);
    throw error;
  }
};

/**
 * Add custom chart to dashboard
 * @param {string} sessionId - Session identifier
 * @param {Object} chartCombination - Chart combination to add
 * @param {Object} activeFilters - Current active filters
 * @returns {Promise} Updated dashboard data
 */
export const addCustomChart = async (sessionId, chartCombination, activeFilters = {}) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!chartCombination) {
      throw new Error('Chart combination is required');
    }

    console.log('➕ Adding custom chart to dashboard:', {
      sessionId,
      chartCombination,
      activeFilters
    });

    const response = await api.post('/api/add-custom-chart', {
      sessionId,
      chartCombination,
      activeFilters
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to add custom chart');
    }

    console.log('✅ Custom chart added successfully:', response.data);
    return response.data;

  } catch (error) {
    console.error('Add custom chart error:', error);
    throw error;
  }
};


/**
 * Get chart insights and story
 * @param {string} sessionId - Session identifier
 * @param {Object} chartConfig - Chart configuration
 * @param {Object} activeFilters - Current filters
 * @param {number} dataLimit - Data limit
 * @returns {Promise} Chart insights
 */
 export const getChartInsights = async (sessionId, chartConfig, activeFilters = {}, dataLimit = null) => {
  try {
    if (!sessionId || !chartConfig) {
      throw new Error('Session ID and chart configuration are required');
    }

    const response = await api.post('/api/chart-insights', {
      sessionId,
      chartConfig,
      activeFilters,
      dataLimit
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get chart insights');
    }

    return response.data;

  } catch (error) {
    console.error('Chart insights error:', error);
    throw error;
  }
};

/**
 * Get complete dashboard story and analysis
 * @param {string} sessionId - Session identifier
 * @param {Object} activeFilters - Current filters
 * @param {number} dataLimit - Data limit
 * @returns {Promise} Dashboard story
 */
export const getDashboardStory = async (sessionId, activeFilters = {}, dataLimit = null) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const response = await api.post('/api/dashboard-story', {
      sessionId,
      activeFilters,
      dataLimit
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get dashboard story');
    }

    return response.data;

  } catch (error) {
    console.error('Dashboard story error:', error);
    throw error;
  }
};

/**
 * Get available filter options
 * @param {string} sessionId - Session identifier
 * @returns {Promise} Filter options
 */
export const getFilterOptions = async (sessionId) => {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const response = await api.get(`/api/filters/${sessionId}`);

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to get filter options');
    }

    return response.data;

  } catch (error) {
    console.error('Get filter options error:', error);
    throw error;
  }
};

/**
 * Health check for API
 * @returns {Promise} Health status
 */
export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('Health check error:', error);
    throw error;
  }
};

// Utility functions for better error handling

/**
 * Check if error is network related
 * @param {Error} error - Error object
 * @returns {boolean} True if network error
 */
export const isNetworkError = (error) => {
  return error.message.includes('Network error') || 
         error.code === 'NETWORK_ERROR' ||
         error.code === 'ECONNABORTED';
};

/**
 * Check if error is server related
 * @param {Error} error - Error object
 * @returns {boolean} True if server error
 */
export const isServerError = (error) => {
  return error.message.includes('Server error') ||
         error.message.includes('500');
};

/**
 * Get user-friendly error message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (error) => {
  if (isNetworkError(error)) {
    return 'Connection problem. Please check your internet and try again.';
  }
  
  if (isServerError(error)) {
    return 'Server is temporarily unavailable. Please try again in a moment.';
  }
  
  return error.message || 'Something went wrong. Please try again.';
};

export default api;