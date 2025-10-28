// backend/services/aiService.js - Optimized for large datasets

class AIService {
    constructor() {
      this.apiKey = process.env.GEMINI_API_KEY;
      // Using gemini-2.5-flash - stable model available in Google AI Studio free tier
      this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

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

      const systemPrompt = "You are a business intelligence consultant helping executives understand their data and make strategic decisions. Focus on business value, not just technical metrics.";
      const fullPrompt = `${systemPrompt}\n\n${prompt}`;

      const requestPayload = {
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500
        }
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify(requestPayload),
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

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

      // Business-focused prompt for dashboard generation
      const prompt = `You are analyzing a ${schema.totalRows}-row business dataset. Think like an executive advisor.

**DATASET:**
MEASURES: ${measures || 'None'}
DIMENSIONS: ${dimensions || 'None'}

**YOUR TASK:**

1. **IDENTIFY BUSINESS DOMAIN:** What type of business data is this? (Sales, HR, Finance, Marketing, Operations, Customer Analytics, etc.)

2. **SUGGEST 4 STRATEGIC KPIs:**
   - Each KPI must answer a critical business question
   - Focus on decision-driving metrics, not just calculations
   - Examples of GOOD KPIs:
     ✓ "Total Revenue" → answers "How much are we making?"
     ✓ "Customer Growth Rate" → answers "Are we growing?"
     ✓ "Average Order Value" → answers "How valuable is each sale?"
   - Examples of BAD KPIs:
     ✗ "Count of rows" (technical, not strategic)
     ✗ "Sum of column A" (doesn't tell business story)

3. **RECOMMEND 4 BUSINESS CHARTS:**
   - Each chart must reveal a business insight or support a decision
   - Explain WHY this chart matters (not just what it shows)
   - Examples of GOOD chart reasoning:
     ✓ "Revenue by Region Bar Chart → Identifies top markets for expansion investment"
     ✓ "Sales Trend Line Chart → Reveals growth acceleration or decline for forecasting"
     ✓ "Product Category Pie Chart → Shows revenue concentration for diversification strategy"
   - Examples of BAD chart reasoning:
     ✗ "Bar chart shows data" (technical description)
     ✗ "Line chart for trends" (generic, no business value)

4. **PROVIDE BUSINESS INSIGHTS:**
   - What strategic observations can you make?
   - What opportunities or risks do you see?
   - What questions should executives be asking?

**OUTPUT FORMAT (JSON only, no markdown):**
{
  "businessDomain": "E-commerce Sales",
  "kpis": [
    {
      "name": "Total Revenue",
      "calculation": "sum",
      "column": "revenue",
      "format": "currency",
      "businessQuestion": "What is our total sales performance?",
      "strategicValue": "Primary growth indicator for investment decisions"
    }
  ],
  "charts": [
    {
      "title": "Revenue Growth Over Time",
      "type": "line",
      "measures": ["revenue"],
      "dimensions": ["date"],
      "businessPurpose": "Track revenue trajectory to identify growth acceleration",
      "expectedInsight": "Seasonal patterns and growth trends",
      "actionableFor": "Sales forecasting and goal setting"
    }
  ],
  "insights": [
    "Revenue shows 35% YoY growth - strong expansion momentum",
    "Top 3 products drive 60% of sales - diversification opportunity exists"
  ]
}

**CRITICAL RULES:**
- Every KPI must answer "What business question does this answer?"
- Every chart must explain "What decision does this support?"
- Insights must be strategic (growth/opportunity/risk), not technical (data quality/completeness)
- Think: "What would a CEO/VP want to know?"

Keep response concise but business-focused.`;

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

      const systemPrompt = "You are a data storytelling expert helping business users create dashboards that drive strategic decisions. Focus on business insights, not just technical performance.";
      const fullPrompt = `${systemPrompt}\n\n${prompt}`;

      const requestPayload = {
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1000
        }
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
      
      const prompt = `You are helping a business user create insightful charts. The user has selected specific data fields they want to analyze.

**USER'S SELECTION:**
MEASURES: ${selectedMeasures.join(', ')}
DIMENSIONS: ${selectedDimensions.join(', ')}
SAMPLE SIZE: ${dataInsights.sampleSize} records

**YOUR TASK:**
Create 3 strategic chart combinations that tell a compelling business story with this data.

**THINK LIKE A BUSINESS ANALYST:**
1. What business questions can these measures and dimensions answer together?
2. What patterns, trends, or comparisons would be most valuable?
3. What decisions could executives make from these charts?

**CHART REQUIREMENTS:**
For each chart, you MUST explain:
- **businessPurpose**: What business question does this chart answer?
- **expectedInsight**: What pattern or trend will this reveal?
- **actionableFor**: What decision or action can users take?

**EXAMPLES OF GOOD CHART REASONING:**
✓ "Compare revenue across regions to identify top markets for expansion investment"
✓ "Track sales trends over time to forecast future demand and set targets"
✓ "Analyze customer segments to prioritize retention vs acquisition strategies"

**EXAMPLES OF BAD CHART REASONING:**
✗ "Bar chart shows data by category" (technical description, no business value)
✗ "Line chart for trends" (generic, doesn't explain WHY)
✗ "Performance-optimized visualization" (focuses on tech, not insights)

**OUTPUT FORMAT (JSON only, no markdown):**
{
  "combinations": [
    {
      "title": "Revenue Performance by Region",
      "type": "bar",
      "measures": ["revenue"],
      "dimensions": ["region"],
      "businessPurpose": "Identify top-performing markets for expansion investment",
      "expectedInsight": "Regional revenue concentration and growth opportunities",
      "actionableFor": "Sales territory planning and resource allocation",
      "aiSuggestion": "Top 3 regions drive 60% of revenue - diversification opportunity in underperforming markets",
      "reasoning": "Regional comparison reveals where to invest sales resources",
      "insights": ["West region shows 2x higher revenue than others - potential best practice to replicate"],
      "isAiGenerated": true
    }
  ]
}

**CRITICAL RULES:**
- Every chart must answer a specific business question
- "businessPurpose" must explain WHY this chart matters for decisions
- "expectedInsight" must describe what pattern/trend it reveals
- "actionableFor" must specify what action users can take
- Think: "What would an executive want to know from this chart?"

Return JSON only, no markdown.`;

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