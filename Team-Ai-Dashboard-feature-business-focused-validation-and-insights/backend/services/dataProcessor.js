// backend/services/dataProcessor.js - Complete with all required methods
const fs = require('fs');
const path = require('path');
const csv = require('papaparse');
const XLSX = require('xlsx');

class DataProcessor {
  
  async processFile(file) {
    try {
      console.log('📁 Processing file:', file.originalname);
      
      const extension = path.extname(file.originalname).toLowerCase();
      let data = [];
      
      // Parse file based on extension
      if (extension === '.csv') {
        data = await this.parseCSV(file.path);
      } else if (extension === '.xlsx' || extension === '.xls') {
        data = await this.parseExcel(file.path);
      } else {
        throw new Error('Unsupported file format');
      }
      
      // Clean up uploaded file
      this.cleanupFile(file.path);
      
      // Generate schema with performance optimizations
      const schema = this.generateSchema(data);
      
      // Create optimized data structure for large datasets
      const optimizedData = this.optimizeDataForLargeDatasets(data, schema);
      
      console.log('✅ Data processed:', data.length, 'rows,', schema.columns.length, 'columns');
      
      return {
        data: optimizedData.data,
        fullDataCount: data.length,
        schema,
        sampleData: optimizedData.sampleData,
        stats: {
          totalRows: data.length,
          totalColumns: schema.columns.length,
          measures: schema.measures.length,
          dimensions: schema.dimensions.length,
          isLargeDataset: data.length > 10000
        }
      };
      
    } catch (error) {
      console.error('❌ Data processing error:', error);
      throw error;
    }
  }

  optimizeDataForLargeDatasets(data, schema) {
    const isLargeDataset = data.length > 10000;
    
    if (!isLargeDataset) {
      return {
        data,
        sampleData: data.slice(0, 1000)
      };
    }

    console.log('🔧 Optimizing large dataset with', data.length, 'rows');

    // Create different sample sizes for different use cases
    const samples = {
      tiny: data.slice(0, 50),      // For quick AI analysis
      small: data.slice(0, 500),    // For initial charts
      medium: data.slice(0, 2000),  // For detailed analysis
      large: data.slice(0, 10000)   // For comprehensive view
    };

    // Store indexes for efficient pagination
    const dataIndexes = {
      totalRows: data.length,
      chunkSize: 1000,
      totalChunks: Math.ceil(data.length / 1000)
    };

    return {
      data: data, // Keep full data for server-side filtering
      sampleData: samples.tiny, // Send smallest sample to AI
      samples,
      dataIndexes
    };
  }

  // New method to get data chunks for pagination
  getDataChunk(data, chunkIndex, chunkSize = 1000) {
    const startIndex = chunkIndex * chunkSize;
    const endIndex = Math.min(startIndex + chunkSize, data.length);
    
    return {
      data: data.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      totalRows: data.length,
      hasMore: endIndex < data.length
    };
  }

  // Enhanced schema generation with sampling for large datasets
  generateSchema(data) {
    if (!data || data.length === 0) {
      throw new Error('No data to analyze');
    }
    
    // For large datasets, use sampling for schema analysis
    const sampleSize = Math.min(data.length, 5000);
    const sampleData = data.slice(0, sampleSize);
    
    const columns = Object.keys(data[0]);
    const schema = {
      columns: [],
      measures: [],
      dimensions: []
    };
    
    columns.forEach(column => {
      const values = sampleData.map(row => row[column]).filter(val => val !== null && val !== undefined);
      const dataType = this.inferDataType(values);
      
      const columnInfo = {
        name: column,
        type: dataType,
        nullable: values.length < sampleData.length,
        uniqueValues: new Set(values).size,
        sampleValues: values.slice(0, 5),
        // Add statistics for performance optimization
        stats: this.calculateColumnStats(values, dataType)
      };
      
      schema.columns.push(columnInfo);
      
      // Classify as measure or dimension with better logic
      if (this.shouldBeMeasure(columnInfo, values)) {
        schema.measures.push(columnInfo);
      } else {
        schema.dimensions.push(columnInfo);
      }
    });
    
    return schema;
  }

  inferDataType(values) {
    if (values.length === 0) return 'string';
    
    let numberCount = 0;
    let dateCount = 0;
    let stringCount = 0;
    
    values.forEach(value => {
      if (typeof value === 'number' && !isNaN(value)) {
        numberCount++;
      } else if (typeof value === 'string') {
        // Check if it's a date string
        if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dateCount++;
        } else {
          stringCount++;
        }
      } else {
        stringCount++;
      }
    });
    
    const total = values.length;
    
    // Determine dominant type (threshold: 80%)
    if (numberCount / total > 0.8) return 'number';
    if (dateCount / total > 0.8) return 'date';
    return 'string';
  }

  shouldBeMeasure(columnInfo, values) {
    const { type, uniqueValues } = columnInfo;
    
    // Must be numeric
    if (type !== 'number') return false;
    
    // Should have reasonable number of unique values (not just 0,1,2)
    if (uniqueValues < 3) return false;
    
    // Calculate variance to check if it's meaningful for aggregation
    const numericValues = values.filter(v => typeof v === 'number');
    if (numericValues.length === 0) return false;
    
    const variance = this.calculateVariance(numericValues);
    
    // Low variance might indicate categorical data coded as numbers
    return variance > 0.1;
  }

  calculateVariance(values) {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  calculateColumnStats(values, dataType) {
    const stats = {
      count: values.length,
      nullCount: 0
    };

    if (dataType === 'number') {
      const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
      
      if (numericValues.length > 0) {
        const sorted = numericValues.sort((a, b) => a - b);
        const sum = numericValues.reduce((acc, val) => acc + val, 0);
        
        stats.min = sorted[0];
        stats.max = sorted[sorted.length - 1];
        stats.sum = sum;
        stats.avg = sum / numericValues.length;
        stats.median = this.calculateMedian(sorted);
        stats.variance = this.calculateVariance(numericValues);
      }
    } else if (dataType === 'string') {
      const uniqueValues = new Set(values);
      stats.uniqueCount = uniqueValues.size;
      stats.cardinality = uniqueValues.size / values.length;
      
      // Calculate most frequent values
      const frequency = {};
      values.forEach(val => {
        frequency[val] = (frequency[val] || 0) + 1;
      });
      
      stats.topValues = Object.entries(frequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
    }

    return stats;
  }

  calculateMedian(sortedArray) {
    const mid = Math.floor(sortedArray.length / 2);
    return sortedArray.length % 2 === 0 
      ? (sortedArray[mid - 1] + sortedArray[mid]) / 2 
      : sortedArray[mid];
  }

  // Enhanced CSV parsing with streaming for large files
  async parseCSV(filePath) {
    const fileSize = fs.statSync(filePath).size;
    const isLargeFile = fileSize > 50 * 1024 * 1024; // 50MB threshold
    
    if (isLargeFile) {
      console.log('📊 Processing large CSV file with streaming...');
      return this.parseCSVStreaming(filePath);
    }
    
    return new Promise((resolve, reject) => {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      csv.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header) => header.trim(),
        transform: (value, field) => {
          return this.cleanDataValue(value);
        },
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('⚠️ CSV parsing warnings:', results.errors.slice(0, 5));
          }
          resolve(results.data.filter(row => Object.keys(row).length > 0));
        },
        error: (error) => {
          reject(new Error('CSV parsing failed: ' + error.message));
        }
      });
    });
  }

  // New streaming parser for very large CSV files
  async parseCSVStreaming(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      let headers = null;
      let rowCount = 0;
      const maxRows = 100000; // Limit to prevent memory issues
      
      const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      
      csv.parse(readStream, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        step: (result, parser) => {
          if (rowCount >= maxRows) {
            parser.abort();
            console.warn(`⚠️ Large file truncated to ${maxRows} rows for performance`);
            return;
          }
          
          if (result.data && Object.keys(result.data).length > 0) {
            results.push(result.data);
            rowCount++;
            
            // Log progress for large files
            if (rowCount % 10000 === 0) {
              console.log(`📈 Processed ${rowCount} rows...`);
            }
          }
        },
        complete: () => {
          console.log(`✅ CSV streaming complete: ${results.length} rows processed`);
          resolve(results);
        },
        error: (error) => {
          reject(new Error('CSV streaming failed: ' + error.message));
        }
      });
    });
  }

  cleanDataValue(value) {
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
    if (this.isValidNumber(stringValue)) {
      const parsed = parseFloat(stringValue);
      // Prevent very large numbers that might cause issues
      return Math.abs(parsed) > Number.MAX_SAFE_INTEGER ? stringValue : parsed;
    }
    
    // Check if it's a date
    if (this.isValidDate(stringValue)) {
      return stringValue;
    }
    
    // Return as string, but limit length for memory efficiency
    return stringValue.length > 1000 ? stringValue.substring(0, 1000) + '...' : stringValue;
  }

  isValidNumber(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }
  
  isValidDate(value) {
    if (!value) return false;
    
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
  }

  async parseExcel(filePath) {
    try {
      const fileSize = fs.statSync(filePath).size;
      const isLargeFile = fileSize > 50 * 1024 * 1024; // 50MB threshold
      
      if (isLargeFile) {
        console.log('📊 Processing large Excel file...');
      }
      
      const workbook = XLSX.readFile(filePath, {
        // Optimize for large files
        cellStyles: false,
        cellFormulas: false,
        sheetStubs: false
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Get sheet range for memory optimization
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      const maxRows = Math.min(range.e.r + 1, 100000); // Limit to 100k rows
      
      if (range.e.r > 100000) {
        console.warn(`⚠️ Excel file has ${range.e.r + 1} rows, limiting to 100,000 for performance`);
      }
      
      // Convert to JSON with row limit
      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        blankrows: false,
        range: `A1:${XLSX.utils.encode_col(range.e.c)}${Math.min(range.e.r + 1, maxRows)}`
      });
      
      if (data.length === 0) {
        throw new Error('Excel file is empty');
      }
      
      // Extract headers and data
      const headers = data[0].map(h => String(h).trim());
      const rows = data.slice(1);
      
      // Convert to object format with memory optimization
      const jsonData = rows.map((row, index) => {
        const obj = {};
        headers.forEach((header, colIndex) => {
          let value = row[colIndex];
          
          if (value !== null && value !== undefined) {
            value = this.cleanDataValue(value);
            
            // Handle Excel dates
            if (typeof value === 'number' && value > 25000 && value < 50000) {
              try {
                const excelDate = XLSX.SSF.parse_date_code(value);
                if (excelDate) {
                  value = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
                }
              } catch (e) {
                // Keep original value if date parsing fails
              }
            }
          }
          
          obj[header] = value;
        });
        return obj;
      }).filter(row => Object.values(row).some(val => val !== null && val !== undefined && val !== ''));
      
      console.log(`✅ Excel processed: ${jsonData.length} rows, ${headers.length} columns`);
      return jsonData;
      
    } catch (error) {
      throw new Error('Excel parsing failed: ' + error.message);
    }
  }
  
  cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Cleaned up uploaded file:', filePath);
      }
    } catch (error) {
      console.warn('⚠️ Could not cleanup file:', error.message);
    }
  }
}

module.exports = new DataProcessor();