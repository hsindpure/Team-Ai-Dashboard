// backend/routes/api.js - COMPLETE FIXED VERSION
const express = require('express');
const router = express.Router();

// Import services
let upload, dataProcessor, aiService, calculator, dataValidator, helpers;

try {
  upload = require('../middleware/upload');
  dataProcessor = require('../services/dataProcessor');
  aiService = require('../services/aiService');
  calculator = require('../services/calculator');
  dataValidator = require('../services/dataValidator');
  helpers = require('../utils/helpers');
  console.log('✅ All services loaded successfully');
} catch (error) {
  console.error('⚠️ Service loading error:', error.message);
}

// Single session store
const sessions = new Map();

// Cleanup old sessions every hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sessionId, sessionData] of sessions.entries()) {
    if (new Date(sessionData.uploadedAt).getTime() < oneHourAgo) {
      sessions.delete(sessionId);
      console.log(`🗑️ Cleaned up expired session: ${sessionId}`);
    }
  }
  
  if (calculator) {
    calculator.clearCache();
  }
}, 60 * 60 * 1000);

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    services: {
      upload: !!upload,
      dataProcessor: !!dataProcessor,
      aiService: !!aiService,
      calculator: !!calculator,
      dataValidator: !!dataValidator,
      helpers: !!helpers
    }
  });
});

// ============================================
// FILE UPLOAD ROUTE
// ============================================
if (upload && dataProcessor && dataValidator && helpers) {
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      console.log('📁 File uploaded:', req.file.originalname);

      // Step 1: Process file
      const processedData = await dataProcessor.processFile(req.file);
      console.log('✅ File processed successfully');

      // Step 2: Validate data
      console.log('🔍 Running validation...');
      const validationResult = await dataValidator.validateData(
        processedData.data,
        processedData.schema
      );
      console.log('✅ Validation complete:', validationResult.overallStatus);

      // Step 3: Generate session ID and store
      const sessionId = helpers.generateSessionId();
      
      sessions.set(sessionId, {
        data: processedData.data,
        schema: processedData.schema,
        stats: processedData.stats,
        sampleData: processedData.sampleData,
        fullDataCount: processedData.data.length,
        validationResult,
        uploadedAt: new Date().toISOString(),
        uploadTime: new Date().toISOString(),
        fileName: req.file.originalname,
        fileSize: req.file.size,
        customCharts: []
      });

      console.log(`💾 Session created: ${sessionId} (${sessions.size} total sessions)`);

      // Step 4: Create preview
      const preview = {
        fileName: req.file.originalname,
        fileSize: helpers.formatBytes(req.file.size),
        totalRows: processedData.stats.totalRows,
        totalColumns: processedData.stats.totalColumns,
        measures: processedData.schema.measures.length,
        dimensions: processedData.schema.dimensions.length,
        validation: {
          status: validationResult.overallStatus,
          isReady: validationResult.isReadyForDashboard,
          issueCount: validationResult.summary.totalIssues
        }
      };

      res.json({
        success: true,
        sessionId,
        preview,
        validationResult
      });

    } catch (error) {
      console.error('❌ Upload/validation error:', error);
      
      if (req.file && req.file.path) {
        const fs = require('fs');
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.warn('Could not cleanup file:', cleanupError.message);
        }
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Upload processing failed'
      });
    }
  });
} else {
  router.post('/upload', (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Upload service not available - missing required services'
    });
  });
}

// ============================================
// GET SESSION DATA
// ============================================
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`📊 Fetching session: ${sessionId}`);
    
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      console.error(`❌ Session not found: ${sessionId}`);
      console.log(`Available sessions: ${Array.from(sessions.keys()).join(', ')}`);
      return res.status(404).json({
        success: false,
        message: 'Session not found or expired'
      });
    }

    console.log(`✅ Session found: ${sessionId}`);

    res.json({
      success: true,
      data: {
        schema: sessionData.schema,
        stats: sessionData.stats,
        fileName: sessionData.fileName,
        uploadedAt: sessionData.uploadedAt,
        validationResult: sessionData.validationResult,
        fullDataCount: sessionData.fullDataCount
      }
    });

  } catch (error) {
    console.error('❌ Session error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving session'
    });
  }
});

// ============================================
// GENERATE DASHBOARD (Main route)
// ============================================
if (aiService && calculator) {
  router.post('/generate-dashboard', async (req, res) => {
    try {
      const { sessionId, filters = {}, dataLimit = null, userContext = null } = req.body;
      
      console.log('\n🎯 ═══════════════════════════════════════════════════');
      console.log('📊 DASHBOARD GENERATION REQUEST');
      console.log('═══════════════════════════════════════════════════');
      console.log('Session ID:', sessionId);
      console.log('Has filters:', Object.keys(filters).length > 0);
      console.log('Data limit:', dataLimit || 'None');
      console.log('Has context:', !!userContext);
      console.log('═══════════════════════════════════════════════════\n');
      
      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }
      
      // Get session data
      const session = sessionStore.get(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found or expired'
        });
      }
      
      // Apply filters
      let filteredData = session.data;
      if (filters && Object.keys(filters).length > 0) {
        filteredData = calculator.applyFilters(session.data, filters);
        console.log(`🔍 Filters applied: ${session.data.length} → ${filteredData.length} records`);
      }
      
      // Apply data limit
      if (dataLimit && dataLimit > 0 && filteredData.length > dataLimit) {
        filteredData = filteredData.slice(0, dataLimit);
        console.log(`📊 Data limited to ${dataLimit} records`);
      }
      
      // ✅ CRITICAL: Single AI suggestion call
      console.log('🤖 Requesting AI suggestions...');
      const aiResult = await aiService.suggestDashboard(
        session.schema,
        session.sampleData,
        filters,
        userContext
      );
      
      // ✅ CRITICAL: Check result structure
      if (!aiResult || !aiResult.success) {
        throw new Error('Invalid AI service response');
      }
      
      console.log(`✅ Suggestions received from: ${aiResult.source}`);
      if (aiResult.usedFallback) {
        console.log(`⚠️  Fallback used due to: ${aiResult.aiError}`);
      }
      
      const suggestions = aiResult.data;
      
      // Calculate KPI values
      console.log('🧮 Calculating KPI values...');
      const kpisWithValues = suggestions.kpis.map(kpi => {
        const value = calculator.calculateKPI(
          filteredData,
          kpi.column,
          kpi.calculation
        );
        
        return {
          ...kpi,
          value: value,
          formattedValue: calculator.formatValue(value, kpi.format)
        };
      });
      
      // Generate chart data
      console.log('📊 Generating chart data...');
      const chartsWithData = suggestions.charts.map(chart => {
        const chartData = calculator.generateChartData(
          filteredData,
          chart.measures,
          chart.dimensions,
          chart.type
        );
        
        return {
          ...chart,
          data: chartData
        };
      });
      
      console.log('\n✅ ═══════════════════════════════════════════════════');
      console.log('✨ DASHBOARD GENERATED SUCCESSFULLY');
      console.log('═══════════════════════════════════════════════════');
      console.log(`📊 KPIs: ${kpisWithValues.length}`);
      console.log(`📈 Charts: ${chartsWithData.length}`);
      console.log(`🎨 Source: ${aiResult.source}`);
      console.log(`⚠️  Fallback: ${aiResult.usedFallback ? 'Yes' : 'No'}`);
      console.log('═══════════════════════════════════════════════════\n');
      
      // ✅ Return unified response
      return res.json({
        success: true,
        source: aiResult.source,
        usedFallback: aiResult.usedFallback,
        requestId: aiResult.requestId,
        data: {
          kpis: kpisWithValues,
          charts: chartsWithData,
          insights: suggestions.insights || null,
          metadata: {
            totalRecords: session.data.length,
            filteredRecords: filteredData.length,
            displayedRecords: filteredData.length,
            timestamp: aiResult.timestamp
          }
        }
      });
      
    } catch (error) {
      console.error('\n❌ ═══════════════════════════════════════════════════');
      console.error('💥 DASHBOARD GENERATION FAILED');
      console.error('═══════════════════════════════════════════════════');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('═══════════════════════════════════════════════════\n');
      
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate dashboard',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
} else {
  router.post('/generate-dashboard', (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Dashboard generation service not available - AI or Calculator service missing'
    });
  });
}

// ============================================
// GENERATE DASHBOARD WITH CUSTOM CHARTS
// ============================================
if (aiService && calculator) {
  router.post('/generate-dashboard-with-custom', async (req, res) => {
    try {
      // ✅ CHANGE 1: Extract userContext from request body
      const { sessionId, filters = {}, includeCustomCharts = true, dataLimit, userContext = null } = req.body;
      
      // ✅ CHANGE 2: Add logging for context
      if (userContext) {
        console.log(`📊 Generating dashboard with custom charts for session: ${sessionId} WITH USER CONTEXT`);
        console.log(`💬 User Context: "${userContext.substring(0, 100)}${userContext.length > 100 ? '...' : ''}"`);
      } else {
        console.log(`📊 Generating dashboard with custom charts for session: ${sessionId} (automatic analysis)`);
      }
      
      const sessionData = sessions.get(sessionId);
  
      if (!sessionData) {
        console.error(`❌ Session not found: ${sessionId}`);
        return res.status(404).json({
          success: false,
          message: 'Session not found or expired'
        });
      }
  
      // ✅ CHANGE 3: Store userContext in session data
      if (userContext) {
        sessionData.userContext = userContext;
        sessions.set(sessionId, sessionData);
      }
  
      // Apply filters with data limit
      let filteredData = calculator.applyFilters(sessionData.data, filters, dataLimit);
  
      // Use sample for AI suggestions
      const sampleData = sessionData.sampleData || filteredData.slice(0, 100);
      
      // Get AI suggestions for default charts
      // ✅ CHANGE 4: Pass userContext to AI service
      const suggestions = await aiService.getSuggestions(
        sessionData.schema, 
        sampleData, 
        userContext  // Pass user context to AI
      );

      // Calculate KPIs with data limit
      const kpis = calculator.calculateKPIs(filteredData, sessionData.schema, suggestions.kpis, dataLimit);

      // Generate default charts with data limit
      const defaultCharts = calculator.generateChartConfigs(filteredData, sessionData.schema, suggestions.charts, dataLimit);

      // Include custom charts if requested
      let customCharts = [];
      if (includeCustomCharts && sessionData.customCharts && sessionData.customCharts.length > 0) {
        console.log(`Including ${sessionData.customCharts.length} custom charts`);
        customCharts = sessionData.customCharts.map(customChart => {
          return calculator.generateSingleChartConfig(
            filteredData,
            sessionData.schema,
            customChart,
            dataLimit
          );
        });
      }

      // Combine all charts
      const allCharts = [...defaultCharts, ...customCharts];

      // Get filter options
      const filterOptions = calculator.getFilterOptions(sessionData.data, sessionData.schema);

      console.log(`✅ Generated: ${kpis.length} KPIs, ${defaultCharts.length} default + ${customCharts.length} custom charts`);

      res.json({
        success: true,
        dashboard: {
          kpis,
          charts: allCharts,
          defaultChartsCount: defaultCharts.length,
          customChartsCount: customCharts.length,
          filterOptions,
          activeFilters: filters,
          dataCount: filteredData.length,
          totalCount: sessionData.data.length,
          performance: {
            dataLimit: dataLimit,
            totalRecords: sessionData.data.length,
            displayedRecords: dataLimit ? Math.min(dataLimit, filteredData.length) : filteredData.length,
            isLimited: dataLimit && filteredData.length > dataLimit,
            isLargeDataset: sessionData.stats?.isLargeDataset || false
          }
        }
      });

    } catch (error) {
      console.error('❌ Generate dashboard with custom charts error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating dashboard: ' + error.message
      });
    }
  });
} else {
  router.post('/generate-dashboard-with-custom', (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Dashboard service not available - AI or Calculator missing'
    });
  });
}

// ============================================
// GET FILTER OPTIONS
// ============================================
if (calculator) {
  router.get('/filters/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      const sessionData = sessions.get(sessionId);

      if (!sessionData) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      const filterOptions = calculator.getFilterOptions(
        sessionData.data, 
        sessionData.schema
      );

      res.json({
        success: true,
        filters: filterOptions
      });

    } catch (error) {
      console.error('❌ Filters error:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting filter options'
      });
    }
  });
} else {
  router.get('/filters/:sessionId', (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Filter service not available'
    });
  });
}

// ============================================
// CUSTOM CHART COMBINATIONS
// ============================================
if (aiService && calculator) {
  router.post('/custom-chart-combinations', async (req, res) => {
    try {
      const { sessionId, selectedMeasures, selectedDimensions, activeFilters } = req.body;
      const sessionData = sessions.get(sessionId);

      if (!sessionData) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      let filteredData = sessionData.data;
      if (activeFilters && Object.keys(activeFilters).length > 0) {
        filteredData = calculator.applyFilters(sessionData.data, activeFilters);
      }

      const combinations = await aiService.getCustomChartCombinations(
        sessionData.schema,
        selectedMeasures,
        selectedDimensions,
        filteredData
      );

      res.json({
        success: true,
        combinations
      });

    } catch (error) {
      console.error('❌ Custom combinations error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating combinations: ' + error.message
      });
    }
  });
}

// ============================================
// ADD CUSTOM CHART
// ============================================
if (calculator) {
  router.post('/add-custom-chart', async (req, res) => {
    try {
      const { sessionId, chartCombination, activeFilters, dataLimit } = req.body;
      const sessionData = sessions.get(sessionId);

      if (!sessionData) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      let filteredData = sessionData.data;
      if (activeFilters && Object.keys(activeFilters).length > 0) {
        filteredData = calculator.applyFilters(sessionData.data, activeFilters, dataLimit);
      }

      const chartConfig = calculator.generateSingleChartConfig(
        filteredData,
        sessionData.schema,
        chartCombination,
        dataLimit
      );

      // Store custom chart in session
      if (!sessionData.customCharts) {
        sessionData.customCharts = [];
      }
      
      // Mark as custom
      chartConfig.isCustom = true;
      
      sessionData.customCharts.push(chartConfig);
      sessions.set(sessionId, sessionData);

      console.log(`✅ Custom chart added. Total custom charts: ${sessionData.customCharts.length}`);

      res.json({
        success: true,
        chart: chartConfig
      });

    } catch (error) {
      console.error('❌ Add custom chart error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding custom chart: ' + error.message
      });
    }
  });
}

// ============================================
// CHART INSIGHTS
// ============================================
router.post('/chart-insights', async (req, res) => {
  try {
    const { sessionId, chartConfig } = req.body;
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const insights = {
      story: `This ${chartConfig.type} chart shows ${chartConfig.measures.join(' and ')} across ${chartConfig.dimensions.join(' and ')}.`,
      keyInsights: [
        `Chart displays ${chartConfig.data?.length || 0} data points`,
        `Primary measure: ${chartConfig.measures[0]}`,
        `Grouped by: ${chartConfig.dimensions[0]}`
      ],
      dataAnalysis: {
        chartType: chartConfig.type,
        dataPoints: chartConfig.data?.length || 0,
        measures: chartConfig.measures.length,
        dimensions: chartConfig.dimensions.length
      },
      recommendations: [
        'Consider filtering data for more focused insights',
        'Try different chart types to explore various perspectives'
      ]
    };

    res.json({
      success: true,
      insights
    });

  } catch (error) {
    console.error('Chart insights error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating chart insights'
    });
  }
});

// ============================================
// DASHBOARD STORY
// ============================================
router.post('/dashboard-story', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const story = {
      executiveSummary: `This dashboard provides comprehensive insights into your dataset with ${sessionData.data?.length || 0} total records.`,
      keyFindings: [
        `Dataset contains ${sessionData.schema?.measures?.length || 0} measurable metrics`,
        `Data is categorized across ${sessionData.schema?.dimensions?.length || 0} different dimensions`
      ],
      trends: [
        'Data patterns show consistent distribution across categories',
        'Multiple correlation opportunities exist between measures'
      ],
      recommendations: [
        'Focus on top-performing categories for strategic planning',
        'Consider time-based analysis for trend identification'
      ]
    };

    res.json({
      success: true,
      story
    });

  } catch (error) {
    console.error('Dashboard story error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating dashboard story'
    });
  }
});

// ============================================
// DEBUG ROUTES
// ============================================
router.get('/sessions', (req, res) => {
  const sessionList = Array.from(sessions.keys()).map(key => {
    const sessionData = sessions.get(key);
    return {
      sessionId: key,
      fileName: sessionData?.fileName,
      uploadTime: sessionData?.uploadedAt,
      rowCount: sessionData?.fullDataCount || 0
    };
  });

  res.json({
    success: true,
    sessions: sessionList,
    totalSessions: sessionList.length
  });
});

router.delete('/sessions', (req, res) => {
  const count = sessions.size;
  sessions.clear();
  
  if (calculator) {
    calculator.clearCache();
  }
  
  res.json({
    success: true,
    message: `Cleared ${count} sessions`
  });
});

module.exports = router;