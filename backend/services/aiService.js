// backend/services/aiService.js - Optimized for large datasets

class AIService {
    constructor() {
      this.apiKey = process.env.OPENROUTER_API_KEY;
      this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
      
      // Enhanced cache with size limits
      this.cache = new Map();
      this.maxCacheSize = 100; // Limit cache entries
      this.maxTokensPerRequest = 4000; // Safe token limit
    }

    
    async getSuggestions(schema, sampleData, userContext = null) {
      try {
        // Create optimized cache key
        const cacheKey = this.generateOptimizedCacheKey(schema, sampleData);
        
        // ✅ ONLY CHANGE: Skip cache if user has context (personalized request)
        if (!userContext && this.cache.has(cacheKey)) {
          console.log('Using cached AI suggestions for large dataset');
          return this.cache.get(cacheKey);
        }
        
        // ✅ ADD: Log when context is present
        if (userContext) {
          console.log('🎯 Requesting AI suggestions WITH user context');
        } else {
          console.log('Requesting AI suggestions for dataset...');
        }
        
        // Use sample data for AI analysis instead of full dataset
        const optimizedSchema = this.optimizeSchemaForAI(schema, sampleData);
        
        let suggestions;
        try {
          // ✅ ONLY CHANGE: Pass userContext to getAISuggestions
          suggestions = await this.getAISuggestions(optimizedSchema, sampleData, userContext);
          console.log('AI suggestions received for large dataset');
        } catch (error) {
          console.warn('AI service failed, using enhanced fallback:', error.message);
          suggestions = this.getEnhancedFallbackSuggestions(schema, sampleData);
        }
        
        // ✅ ONLY CHANGE: Don't cache personalized results
        if (!userContext) {
          this.manageCacheSize();
          this.cache.set(cacheKey, suggestions);
        }
        
        return suggestions;
        
      } catch (error) {
        console.error('AI service error:', error);
        return this.getEnhancedFallbackSuggestions(schema, sampleData);
      }
    }

    optimizeSchemaForAI(schema, sampleData) {
      // Reduce schema size for AI consumption
      const optimizedMeasures = schema.measures.slice(0, 10).map(m => ({
        name: m.name,
        type: m.type,
        uniqueValues: Math.min(m.uniqueValues, 1000), // Cap for token efficiency
        stats: m.stats ? {
          min: m.stats.min,
          max: m.stats.max,
          avg: m.stats.avg
        } : null
      }));

      const optimizedDimensions = schema.dimensions.slice(0, 10).map(d => ({
        name: d.name,
        type: d.type,
        uniqueValues: Math.min(d.uniqueValues, 100), // Cap for token efficiency
        cardinality: d.stats?.cardinality || 'unknown'
      }));

      return {
        measures: optimizedMeasures,
        dimensions: optimizedDimensions,
        totalRows: sampleData ? sampleData.length : 'sample',
        datasetSize: schema.columns ? schema.columns.length : 0
      };
    }

    async getAISuggestions(optimizedSchema, sampleData) {
      if (!this.apiKey) {
        throw new Error('AI API key not configured');
      }
      
      const prompt = this.buildOptimizedPrompt(optimizedSchema, sampleData);
      
      // Validate prompt size
      if (prompt.length > this.maxTokensPerRequest * 3) {
        console.warn('Prompt too large, using fallback');
        throw new Error('Dataset too large for AI analysis');
      }
      
      const requestPayload = {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a data visualization expert. Provide concise, actionable insights for large datasets."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500, // Limit response size
        temperature: 0.7
      };
      
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload),
        timeout: 30000 // 30 second timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No AI response received');
      }
      
      return this.parseAIResponse(content, optimizedSchema);
    }

    buildOptimizedPrompt(schema, sampleData) {
      const measures = schema.measures.map(m => 
        `${m.name} (${m.type}${m.stats ? `, range: ${m.stats.min}-${m.stats.max}` : ''})`
      ).join(', ');
      
      const dimensions = schema.dimensions.map(d => 
        `${d.name} (${d.type}, ${d.uniqueValues} unique values)`
      ).join(', ');

      // Simplified prompt for large datasets
      const prompt = `Analyze this ${schema.totalRows} row dataset and suggest 4 KPIs and 4 charts:

MEASURES: ${measures || 'None'}
DIMENSIONS: ${dimensions || 'None'}

Focus on:
1. Business-relevant KPIs (sum, avg, count, max, min)
2. Effective chart types (bar, line, pie, area)
3. Performance-optimized visualizations

Return JSON:
{
  "kpis": [{"name": "Total Sales", "calculation": "sum", "column": "sales", "format": "currency"}],
  "charts": [{"title": "Sales by Region", "type": "bar", "measures": ["sales"], "dimensions": ["region"]}],
  "insights": ["Key business insights"]
}

Keep response concise for performance.`;

      return prompt;
    }

    async getCustomChartCombinations(schema, selectedMeasures, selectedDimensions, filteredData) {
      try {
        console.log('Generating optimized chart combinations for large dataset...');
        
        // Use sample of filtered data if too large
        const sampleSize = Math.min(filteredData.length, 1000);
        const sampleData = filteredData.slice(0, sampleSize);
        
        let combinations;
        try {
          combinations = await this.getAICustomCombinations(
            schema, 
            selectedMeasures, 
            selectedDimensions, 
            sampleData
          );
        } catch (error) {
          console.warn('AI custom combinations failed, using optimized fallback:', error.message);
          combinations = this.getOptimizedFallbackCombinations(
            schema, 
            selectedMeasures, 
            selectedDimensions, 
            sampleData
          );
        }

        return combinations;

      } catch (error) {
        console.error('Custom combinations error:', error);
        return this.getOptimizedFallbackCombinations(
          schema, 
          selectedMeasures, 
          selectedDimensions, 
          []
        );
      }
    }

    async getAICustomCombinations(schema, selectedMeasures, selectedDimensions, sampleData) {
      if (!this.apiKey) {
        throw new Error('AI API key not configured');
      }

      const prompt = this.buildOptimizedCustomPrompt(
        schema, 
        selectedMeasures, 
        selectedDimensions, 
        sampleData
      );

      const requestPayload = {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "system", 
            content: "You are an expert at creating performance-optimized data visualizations for large datasets."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000, // Reduced for performance
        temperature: 0.5
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No AI response received');
      }

      return this.parseAICustomCombinations(content, selectedMeasures, selectedDimensions);
    }

    buildOptimizedCustomPrompt(schema, selectedMeasures, selectedDimensions, sampleData) {
      // Simplified analysis for performance
      const dataInsights = {
        sampleSize: sampleData.length,
        measureCount: selectedMeasures.length,
        dimensionCount: selectedDimensions.length
      };
      
      const prompt = `Create 3 optimized chart combinations for this data selection:

MEASURES: ${selectedMeasures.join(', ')}
DIMENSIONS: ${selectedDimensions.join(', ')}
SAMPLE SIZE: ${dataInsights.sampleSize} records

Focus on performance-optimized charts suitable for large datasets.

Return JSON only:
{
  "combinations": [
    {
      "title": "Chart Title",
      "type": "bar",
      "measures": ["measure1"],
      "dimensions": ["dimension1"],
      "aiSuggestion": "Why this chart works well",
      "reasoning": "Performance consideration",
      "insights": ["Business insight"],
      "isAiGenerated": true
    }
  ]
}`;

      return prompt;
    }

    getEnhancedFallbackSuggestions(schema, sampleData) {
      console.log('Generating enhanced fallback suggestions for large dataset');
      
      const kpis = [];
      const charts = [];
      
      // Smart KPI generation based on data characteristics
      schema.measures.slice(0, 4).forEach((measure, index) => {
        // Choose calculation based on data distribution
        let calculation = 'sum';
        if (measure.stats) {
          const variance = measure.stats.variance || 0;
          if (variance < 100) calculation = 'avg'; // Low variance, avg makes sense
          if (measure.stats.max > measure.stats.avg * 10) calculation = 'max'; // High outliers
        }

        const kpi = {
          name: `${this.getSmartKPIName(measure.name, calculation)}`,
          calculation,
          column: measure.name,
          format: this.guessNumberFormat(measure.name)
        };
        kpis.push(kpi);
      });
      
      // Add record count KPI
      kpis.unshift({
        name: 'Total Records',
        calculation: 'count',
        column: '*',
        format: 'number'
      });
      
      // Smart chart generation
      if (schema.measures.length > 0 && schema.dimensions.length > 0) {
        const primaryMeasure = schema.measures[0];
        const bestDimensions = this.selectBestDimensions(schema.dimensions);
        
        bestDimensions.forEach((dimension, index) => {
          if (charts.length >= 4) return;
          
          const chartType = this.selectOptimalChartType(primaryMeasure, dimension);
          
          const chart = {
            title: `${this.formatColumnName(primaryMeasure.name)} by ${this.formatColumnName(dimension.name)}`,
            type: chartType,
            measures: [primaryMeasure.name],
            dimensions: [dimension.name],
            optimizedForLargeData: true
          };
          charts.push(chart);
        });
      }
      
      return {
        kpis: kpis.slice(0, 4),
        charts: charts.slice(0, 4),
        insights: [
          `Dataset optimized for ${sampleData ? sampleData.length : 'large'} records`,
          'Charts use performance-optimized rendering',
          `Found ${schema.measures.length} numeric and ${schema.dimensions.length} categorical columns`,
          'Use data limit controls for better performance'
        ]
      };
    }

    selectBestDimensions(dimensions) {
      // Sort dimensions by suitability for visualization
      return dimensions
        .filter(d => d.uniqueValues <= 50) // Exclude high cardinality
        .sort((a, b) => {
          // Prefer date columns
          if (a.type === 'date' && b.type !== 'date') return -1;
          if (b.type === 'date' && a.type !== 'date') return 1;
          
          // Prefer moderate cardinality
          const aScore = Math.abs(a.uniqueValues - 7); // Sweet spot around 7 categories
          const bScore = Math.abs(b.uniqueValues - 7);
          return aScore - bScore;
        })
        .slice(0, 4);
    }

    selectOptimalChartType(measure, dimension) {
      // Smart chart type selection based on data characteristics
      if (dimension.type === 'date') return 'line';
      if (dimension.uniqueValues <= 5) return 'pie';
      if (dimension.uniqueValues <= 15) return 'bar';
      return 'area';
    }

    getSmartKPIName(columnName, calculation) {
      const formatted = this.formatColumnName(columnName);
      const prefixes = {
        sum: 'Total',
        avg: 'Average',
        max: 'Maximum',
        min: 'Minimum',
        count: 'Count of'
      };
      return `${prefixes[calculation] || 'Total'} ${formatted}`;
    }

    manageCacheSize() {
      if (this.cache.size >= this.maxCacheSize) {
        // Remove oldest entries
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
    }

    generateOptimizedCacheKey(schema, sampleData) {
      // Create smaller cache key for large datasets
      const measureNames = schema.measures.slice(0, 5).map(m => m.name).join('|');
      const dimensionNames = schema.dimensions.slice(0, 5).map(d => d.name).join('|');
      const sampleSize = sampleData ? sampleData.length : 0;
      
      const key = `${measureNames}:${dimensionNames}:${sampleSize}`;
      return Buffer.from(key).toString('base64').slice(0, 20);
    }

    getOptimizedFallbackCombinations(schema, selectedMeasures, selectedDimensions, sampleData) {
      console.log('Generating optimized fallback combinations');
      
      const combinations = [];
      const chartTypes = ['bar', 'line', 'pie', 'area'];
      
      // Generate smart combinations based on data characteristics
      chartTypes.forEach((chartType, index) => {
        if (combinations.length >= 3) return; // Limit for performance
        
        let selectedMeasure = selectedMeasures[0];
        let selectedDimension = selectedDimensions[0];
        
        // Smart selection based on chart type and data size
        switch (chartType) {
          case 'pie':
            // Find low cardinality dimension
            selectedDimension = selectedDimensions.find(dim => {
              const dimInfo = schema.dimensions?.find(d => d.name === dim);
              return dimInfo?.uniqueValues <= 8;
            }) || selectedDimensions[0];
            break;
          
          case 'line':
            // Prefer date dimensions for line charts
            selectedDimension = selectedDimensions.find(dim => {
              const dimInfo = schema.dimensions?.find(d => d.name === dim);
              return dimInfo?.type === 'date';
            }) || selectedDimensions[0];
            break;
          
          case 'bar':
            // Use dimension with moderate cardinality
            selectedDimension = selectedDimensions.find(dim => {
              const dimInfo = schema.dimensions?.find(d => d.name === dim);
              return dimInfo?.uniqueValues <= 20;
            }) || selectedDimensions[0];
            break;
          
          case 'area':
            // Good for trending data
            if (selectedMeasures.length > 1) {
              selectedMeasure = selectedMeasures.slice(0, 2);
            }
            break;
        }

        const combination = {
          title: `${this.formatColumnName(selectedMeasure)} by ${this.formatColumnName(selectedDimension)}`,
          type: chartType,
          measures: Array.isArray(selectedMeasure) ? selectedMeasure : [selectedMeasure],
          dimensions: [selectedDimension],
          aiSuggestion: this.getOptimizedSuggestion(chartType, selectedMeasure, selectedDimension),
          insights: this.getPerformanceInsights(chartType, sampleData.length),
          isAiGenerated: false,
          optimizedForLargeData: true
        };
        
        combinations.push(combination);
      });
      
      return combinations;
    }

    getOptimizedSuggestion(chartType, measure, dimension) {
      const suggestions = {
        bar: `Optimized bar chart for comparing ${this.formatColumnName(measure)} across ${this.formatColumnName(dimension)} categories`,
        line: `Performance-optimized line chart showing ${this.formatColumnName(measure)} trends over ${this.formatColumnName(dimension)}`,
        pie: `Efficient pie chart displaying ${this.formatColumnName(measure)} distribution by ${this.formatColumnName(dimension)}`,
        area: `Streamlined area chart visualizing ${this.formatColumnName(measure)} patterns across ${this.formatColumnName(dimension)}`
      };
      
      return suggestions[chartType] || 'Optimized chart for large dataset visualization';
    }

    getPerformanceInsights(chartType, dataSize) {
      const baseInsights = {
        bar: ['Category comparison', 'Performance ranking', 'Optimized rendering'],
        line: ['Trend analysis', 'Time-series data', 'Efficient line rendering'],
        pie: ['Proportion analysis', 'Limited categories', 'Fast pie rendering'],
        area: ['Cumulative trends', 'Multiple measures', 'Smooth area charts']
      };
      
      const insights = baseInsights[chartType] || ['Data visualization', 'Performance optimized'];
      
      if (dataSize > 10000) {
        insights.push('Large dataset optimized');
      }
      
      return insights;
    }

    parseAIResponse(content, schema) {
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        
        const parsed = JSON.parse(jsonStr);
        return this.validateSuggestions(parsed, schema);
        
      } catch (error) {
        console.warn('Could not parse AI response, using enhanced fallback:', error.message);
        return this.getEnhancedFallbackSuggestions(schema, null);
      }
    }

    parseAICustomCombinations(content, selectedMeasures, selectedDimensions) {
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        
        const parsed = JSON.parse(jsonStr);
        const validCombinations = this.validateCustomCombinations(
          parsed.combinations || [], 
          selectedMeasures, 
          selectedDimensions
        );
        
        return validCombinations;
        
      } catch (error) {
        console.warn('Could not parse AI custom combinations, using fallback:', error.message);
        return this.getOptimizedFallbackCombinations({}, selectedMeasures, selectedDimensions, []);
      }
    }

    validateSuggestions(suggestions, schema) {
      const validSuggestions = {
        kpis: [],
        charts: [],
        insights: suggestions.insights || []
      };
      
      // Validate KPIs with performance considerations
      if (suggestions.kpis && Array.isArray(suggestions.kpis)) {
        suggestions.kpis.slice(0, 4).forEach((kpi) => { // Limit KPIs for performance
          if (kpi.name && kpi.column && (schema.measures.find(m => m.name === kpi.column) || kpi.column === '*')) {
            validSuggestions.kpis.push({
              name: kpi.name,
              calculation: kpi.calculation || 'sum',
              column: kpi.column,
              format: kpi.format || 'number'
            });
          }
        });
      }
      
      // Validate Charts with performance considerations
      if (suggestions.charts && Array.isArray(suggestions.charts)) {
        suggestions.charts.slice(0, 4).forEach((chart) => { // Limit charts for performance
          if (chart.title && chart.type && chart.measures && chart.dimensions) {
            const validMeasures = chart.measures.filter(m => 
              schema.measures.find(measure => measure.name === m)
            ).slice(0, 3); // Limit measures per chart
            
            const validDimensions = chart.dimensions.filter(d => 
              schema.dimensions.find(dim => dim.name === d)
            ).slice(0, 2); // Limit dimensions per chart
            
            if (validMeasures.length > 0 && validDimensions.length > 0) {
              validSuggestions.charts.push({
                title: chart.title,
                type: chart.type,
                measures: validMeasures,
                dimensions: validDimensions,
                optimizedForLargeData: true
              });
            }
          }
        });
      }
      
      // Ensure we have at least some suggestions
      if (validSuggestions.kpis.length === 0 || validSuggestions.charts.length === 0) {
        return this.getEnhancedFallbackSuggestions(schema, null);
      }
      
      return validSuggestions;
    }

    validateCustomCombinations(combinations, selectedMeasures, selectedDimensions) {
      const validCombinations = [];
      
      combinations.slice(0, 3).forEach((combo, index) => { // Limit combinations for performance
        if (combo.type && combo.measures && combo.dimensions) {
          const validMeasures = combo.measures.filter(m => selectedMeasures.includes(m)).slice(0, 2);
          const validDimensions = combo.dimensions.filter(d => selectedDimensions.includes(d)).slice(0, 1);
          
          if (validMeasures.length > 0 && validDimensions.length > 0) {
            validCombinations.push({
              title: combo.title || `${combo.type.charAt(0).toUpperCase() + combo.type.slice(1)} Chart ${index + 1}`,
              type: combo.type,
              measures: validMeasures,
              dimensions: validDimensions,
              aiSuggestion: combo.aiSuggestion || combo.reasoning || 'AI-generated combination optimized for large datasets',
              insights: combo.insights || [],
              isAiGenerated: true,
              optimizedForLargeData: true
            });
          }
        }
      });
      
      return validCombinations;
    }
    
    formatColumnName(name) {
      if (Array.isArray(name)) {
        return name.map(n => this.formatColumnName(n)).join(' & ');
      }
      return name
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
    
    guessNumberFormat(columnName) {
      const name = columnName.toLowerCase();
      if (name.includes('revenue') || name.includes('sales') || name.includes('price') || name.includes('cost')) {
        return 'currency';
      }
      if (name.includes('percent') || name.includes('rate') || name.includes('%')) {
        return 'percent';
      }
      return 'number';
    }
  }
  
  module.exports = new AIService();