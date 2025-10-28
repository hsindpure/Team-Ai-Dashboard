// backend/services/calculator.js - Optimized for large datasets

class Calculator {
  
    constructor() {
      this.maxChartDataPoints = 1000; // Limit data points for performance
      this.aggregationCache = new Map();
    }
  
    calculateKPIs(data, schema, kpiDefinitions, dataLimit = null) {
      // Use limited dataset for KPI calculations if specified
      const workingData = dataLimit ? data.slice(0, dataLimit) : data;
      const kpis = [];
      
      kpiDefinitions.forEach(def => {
        try {
          const kpi = this.calculateSingleKPI(workingData, def);
          if (kpi) {
            // Add metadata about data limitation
            kpi.dataPoints = workingData.length;
            kpi.isLimited = dataLimit && data.length > dataLimit;
            kpis.push(kpi);
          }
        } catch (error) {
          console.warn(`Warning calculating KPI ${def.name}:`, error.message);
        }
      });
      
      return kpis;
    }
    
    calculateSingleKPI(data, definition) {
      const cacheKey = `${definition.calculation}_${definition.column}_${data.length}`;
      
      // Check cache for expensive calculations
      if (this.aggregationCache.has(cacheKey)) {
        const cached = this.aggregationCache.get(cacheKey);
        return {
          ...cached,
          name: definition.name,
          format: definition.format
        };
      }
  
      let value = 0;
      
      switch (definition.calculation.toLowerCase()) {
        case 'sum':
          value = this.calculateSum(data, definition.column);
          break;
          
        case 'avg':
        case 'average':
          value = this.calculateAverage(data, definition.column);
          break;
          
        case 'count':
          value = this.calculateCount(data, definition.column);
          break;
          
        case 'max':
          value = this.calculateMax(data, definition.column);
          break;
          
        case 'min':
          value = this.calculateMin(data, definition.column);
          break;
          
        default:
          console.warn(`Unknown calculation type: ${definition.calculation}`);
          return null;
      }
      
      const result = {
        value: value,
        formattedValue: this.formatValue(value, definition.format),
        calculation: definition.calculation,
        column: definition.column
      };
  
      // Cache result for performance
      this.aggregationCache.set(cacheKey, result);
      
      return {
        name: definition.name,
        ...result,
        format: definition.format
      };
    }
  
    // Optimized calculation methods
    calculateSum(data, column) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const val = parseFloat(data[i][column]);
        if (!isNaN(val)) sum += val;
      }
      return sum;
    }
  
    calculateAverage(data, column) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < data.length; i++) {
        const val = parseFloat(data[i][column]);
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    }
  
    calculateCount(data, column) {
      if (column === '*') {
        return data.length;
      }
      
      let count = 0;
      for (let i = 0; i < data.length; i++) {
        const val = data[i][column];
        if (val !== null && val !== undefined && val !== '') {
          count++;
        }
      }
      return count;
    }
  
    calculateMax(data, column) {
      let max = -Infinity;
      for (let i = 0; i < data.length; i++) {
        const val = parseFloat(data[i][column]);
        if (!isNaN(val) && val > max) max = val;
      }
      return max === -Infinity ? 0 : max;
    }
  
    calculateMin(data, column) {
      let min = Infinity;
      for (let i = 0; i < data.length; i++) {
        const val = parseFloat(data[i][column]);
        if (!isNaN(val) && val < min) min = val;
      }
      return min === Infinity ? 0 : min;
    }
    
    formatValue(value, format) {
      if (isNaN(value) || !isFinite(value)) {
        return '0';
      }
      
      switch (format?.toLowerCase()) {
        case 'currency':
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(value);
          
        case 'percent':
          return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
          }).format(value / 100);
          
        case 'number':
        default:
          if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          } else {
            return value.toLocaleString();
          }
      }
    }
    
    generateChartConfigs(data, schema, chartDefinitions, dataLimit = null) {
      // Apply data limit for performance
      const workingData = dataLimit ? data.slice(0, dataLimit) : data;
      const charts = [];
      
      chartDefinitions.forEach((def, index) => {
        try {
          const chartData = this.prepareOptimizedChartData(workingData, def);
          if (chartData && chartData.length > 0) {
            charts.push({
              id: `chart_${index}`,
              title: def.title,
              type: def.type,
              data: chartData,
              measures: def.measures,
              dimensions: def.dimensions,
              config: this.generateChartOption(def.type, chartData, def.measures, def.dimensions),
              dataPoints: workingData.length,
              isLimited: dataLimit && data.length > dataLimit,
              optimizedForLargeData: def.optimizedForLargeData || false
            });
          }
        } catch (error) {
          console.warn(`Warning generating chart ${def.title}:`, error.message);
        }
      });
      
      return charts;
    }
    
    prepareOptimizedChartData(data, chartDef) {
      const { measures, dimensions, type } = chartDef;
      
      if (!measures || !dimensions || measures.length === 0 || dimensions.length === 0) {
        return [];
      }
      
      const primaryDimension = dimensions[0];
      const primaryMeasure = measures[0];
      
      // Use efficient grouping for large datasets
      const grouped = this.optimizedGroupBy(data, primaryDimension);
      
      // Calculate aggregated values with performance optimization
      const chartData = Object.keys(grouped).map(key => {
        const group = grouped[key];
        const dataPoint = { [primaryDimension]: key };
        
        measures.forEach(measure => {
          dataPoint[measure] = this.calculateSum(group, measure);
        });
        
        return dataPoint;
      });
      
      // Limit data points for chart performance
      const sortedData = this.sortChartData(chartData, primaryMeasure, type);
      
      // Apply intelligent data reduction for large datasets
      return this.reduceDataForVisualization(sortedData, type);
    }
  
    optimizedGroupBy(data, dimension) {
      const groups = {};
      
      for (let i = 0; i < data.length; i++) {
        const key = data[i][dimension] || 'Unknown';
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(data[i]);
      }
      
      return groups;
    }
  
    reduceDataForVisualization(data, chartType) {
      // Apply different reduction strategies based on chart type and data size
      if (data.length <= this.maxChartDataPoints) {
        return data;
      }
  
      console.log(`Reducing ${data.length} data points to ${this.maxChartDataPoints} for ${chartType} chart`);
  
      switch (chartType) {
        case 'pie':
          // For pie charts, keep top categories and group others
          return this.reduceForPieChart(data);
        
        case 'line':
        case 'area':
          // For time series, use intelligent sampling
          return this.reduceForTimeSeries(data);
        
        case 'bar':
        default:
          // For bar charts, keep top values
          return this.reduceForBarChart(data);
      }
    }
  
    reduceForPieChart(data) {
      // Keep top 8 categories, group the rest as "Others"
      const maxCategories = 8;
      
      if (data.length <= maxCategories) {
        return data;
      }
  
      const sorted = data.sort((a, b) => {
        const aVal = Object.values(a).find(v => typeof v === 'number') || 0;
        const bVal = Object.values(b).find(v => typeof v === 'number') || 0;
        return bVal - aVal;
      });
  
      const topCategories = sorted.slice(0, maxCategories - 1);
      const otherCategories = sorted.slice(maxCategories - 1);
  
      if (otherCategories.length > 0) {
        // Sum up "Others" category
        const othersSum = otherCategories.reduce((sum, item) => {
          const value = Object.values(item).find(v => typeof v === 'number') || 0;
          return sum + value;
        }, 0);
  
        const dimensionKey = Object.keys(data[0]).find(k => typeof data[0][k] !== 'number');
        const measureKey = Object.keys(data[0]).find(k => typeof data[0][k] === 'number');
  
        topCategories.push({
          [dimensionKey]: 'Others',
          [measureKey]: othersSum
        });
      }
  
      return topCategories;
    }
  
    reduceForTimeSeries(data) {
      // Intelligent sampling for time series data
      const targetPoints = Math.min(this.maxChartDataPoints, data.length);
      const step = Math.ceil(data.length / targetPoints);
      
      const reduced = [];
      for (let i = 0; i < data.length; i += step) {
        reduced.push(data[i]);
      }
      
      return reduced;
    }
  
    reduceForBarChart(data) {
      // Keep top N categories for bar charts
      const maxBars = Math.min(50, this.maxChartDataPoints);
      
      if (data.length <= maxBars) {
        return data;
      }
  
      return data.slice(0, maxBars);
    }
    
    sortChartData(data, primaryMeasure, chartType) {
      switch (chartType) {
        case 'pie':
          return data.sort((a, b) => (b[primaryMeasure] || 0) - (a[primaryMeasure] || 0));
          
        case 'line':
        case 'area':
          return data.sort((a, b) => {
            const aKey = Object.keys(a).find(k => k !== primaryMeasure);
            const bKey = Object.keys(b).find(k => k !== primaryMeasure);
            return String(a[aKey]).localeCompare(String(b[bKey]));
          });
          
        case 'bar':
        default:
          return data.sort((a, b) => (b[primaryMeasure] || 0) - (a[primaryMeasure] || 0));
      }
    }
    
    generateChartOption(type, data, measures, dimensions) {
      const primaryMeasure = measures[0];
      const primaryDimension = dimensions[0];
      
      const baseConfig = {
        data: data,
        margin: { top: 20, right: 30, left: 20, bottom: 5 }
      };
      
      switch (type) {
        case 'bar':
          return {
            ...baseConfig,
            type: 'BarChart',
            dataKey: primaryMeasure,
            xAxisKey: primaryDimension
          };
          
        case 'line':
          return {
            ...baseConfig,
            type: 'LineChart',
            dataKey: primaryMeasure,
            xAxisKey: primaryDimension
          };
          
        case 'area':
          return {
            ...baseConfig,
            type: 'AreaChart',
            dataKey: primaryMeasure,
            xAxisKey: primaryDimension
          };
          
        case 'pie':
          return {
            ...baseConfig,
            type: 'PieChart',
            dataKey: primaryMeasure,
            nameKey: primaryDimension
          };
          
        case 'scatter':
          return {
            ...baseConfig,
            type: 'ScatterChart',
            dataKey: primaryMeasure,
            xAxisKey: primaryDimension
          };
          
        default:
          return baseConfig;
      }
    }
    
    applyFilters(data, filters, dataLimit = null) {
      if (!filters || Object.keys(filters).length === 0) {
        return dataLimit ? data.slice(0, dataLimit) : data;
      }
      
      // Optimize filtering for large datasets
      const filtered = [];
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        let matchesAllFilters = true;
        
        // Check each filter
        for (const filterKey in filters) {
          const filterValues = filters[filterKey];
          
          if (!filterValues || filterValues.length === 0) {
            continue;
          }
          
          const rowValue = row[filterKey];
          
          if (rowValue === null || rowValue === undefined) {
            if (!filterValues.includes('null') && !filterValues.includes('undefined')) {
              matchesAllFilters = false;
              break;
            }
          } else {
            if (!filterValues.includes(String(rowValue))) {
              matchesAllFilters = false;
              break;
            }
          }
        }
        
        if (matchesAllFilters) {
          filtered.push(row);
          
          // Apply data limit during filtering for performance
          if (dataLimit && filtered.length >= dataLimit) {
            break;
          }
        }
      }
      
      return filtered;
    }
    
    getFilterOptions(data, schema, sampleSize = 10000) {
      const filterOptions = {};
      
      // Use sample for large datasets to improve performance
      const sampleData = data.length > sampleSize ? data.slice(0, sampleSize) : data;
      
      schema.dimensions.forEach(dimension => {
        const uniqueValues = new Set();
        
        // Collect unique values efficiently
        for (let i = 0; i < sampleData.length; i++) {
          const value = sampleData[i][dimension.name];
          if (value !== null && value !== undefined) {
            uniqueValues.add(String(value));
            
            // Limit options for performance
            if (uniqueValues.size > 100) break;
          }
        }
        
        const values = Array.from(uniqueValues).sort();
        
        // Only include dimensions with reasonable number of unique values
        if (values.length > 1 && values.length <= 100) {
          filterOptions[dimension.name] = {
            label: this.formatColumnName(dimension.name),
            options: values.map(value => ({
              label: value,
              value: value
            })),
            isSampled: data.length > sampleSize
          };
        }
      });
      
      return filterOptions;
    }
  
    // New method for data limit options
    getDataLimitOptions() {
      return [
        { label: 'Top 50 Records', value: 50 },
        { label: 'Top 100 Records', value: 100 },
        { label: 'Top 1,000 Records', value: 1000 },
        { label: 'Top 10,000 Records', value: 10000 },
        { label: 'All Data', value: null }
      ];
    }
  
    // Method to get optimized data based on limit
    getOptimizedData(data, dataLimit) {
      if (!dataLimit || dataLimit >= data.length) {
        return {
          data: data,
          isLimited: false,
          totalRecords: data.length,
          displayedRecords: data.length
        };
      }
  
      return {
        data: data.slice(0, dataLimit),
        isLimited: true,
        totalRecords: data.length,
        displayedRecords: Math.min(dataLimit, data.length)
      };
    }
  
    // Clear cache periodically to prevent memory leaks
    clearCache() {
      this.aggregationCache.clear();
      console.log('Calculator cache cleared for memory optimization');
    }
  
    // Method to generate single chart config for custom charts
    generateSingleChartConfig(data, schema, chartCombination, dataLimit = null) {
      try {
        const workingData = dataLimit ? data.slice(0, dataLimit) : data;
        
        const chartData = this.prepareOptimizedChartData(workingData, chartCombination);
        
        if (!chartData || chartData.length === 0) {
          throw new Error('No data available for chart generation');
        }
  
        const chartConfig = {
          id: chartCombination.id || `chart_${Date.now()}`,
          title: chartCombination.title || `${chartCombination.type.charAt(0).toUpperCase() + chartCombination.type.slice(1)} Chart`,
          type: chartCombination.type,
          data: chartData,
          measures: chartCombination.measures,
          dimensions: chartCombination.dimensions,
          config: this.generateChartOption(chartCombination.type, chartData, chartCombination.measures, chartCombination.dimensions),
          isCustom: chartCombination.isCustom || false,
          aiSuggestion: chartCombination.aiSuggestion,
          insights: chartCombination.insights || [],
          isAiGenerated: chartCombination.isAiGenerated || false,
          dataPoints: workingData.length,
          isLimited: dataLimit && data.length > dataLimit,
          optimizedForLargeData: true
        };
  
        return chartConfig;
  
      } catch (error) {
        console.error('Error generating single chart config:', error);
        throw error;
      }
    }
    
    formatColumnName(name) {
      return name
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
  }
  
  module.exports = new Calculator();