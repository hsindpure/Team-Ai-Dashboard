// backend/services/dataValidator.js - Compatible with existing aiService
const aiService = require('./aiService');

class DataValidator {
  
  /**
   * Main validation orchestrator
   */
  async validateData(data, schema) {
    console.log('🔍 Starting comprehensive data validation...');
    
    const startTime = Date.now();
    
    try {
      // Step 1: Generate sample for AI analysis
      const sampleData = this.generateValidationSample(data, schema);
      console.log(`📊 Generated validation sample: ${sampleData.dataSnapshot.length} rows`);
      
      // Step 2: Run AI validation (with error handling)
      let aiValidation = null;
      try {
        aiValidation = await this.runAIValidation(sampleData, schema);
        console.log('✅ AI validation completed');
      } catch (error) {
        console.warn('⚠️ AI validation failed, continuing with rule-based only:', error.message);
      }
      
      // Step 3: Run rule-based validation (always runs)
      const ruleBasedValidation = this.runRuleBasedValidation(data, schema);
      console.log('✅ Rule-based validation completed');
      
      // Step 4: Merge results
      const validationResult = this.mergeValidationResults(aiValidation, ruleBasedValidation);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Validation complete in ${duration}s - Status: ${validationResult.overallStatus}`);
      
      return validationResult;
      
    } catch (error) {
      console.error('❌ Validation error:', error);
      
      // Return basic validation result on error
      return {
        overallStatus: 'error',
        isReadyForDashboard: false,
        confidence: 0,
        validationResults: [{
          category: 'system',
          severity: 'error',
          issue: 'Validation system error occurred',
          affectedColumns: [],
          recommendation: 'Please try uploading again or contact support',
          examples: [error.message]
        }],
        summary: {
          totalIssues: 1,
          errors: 1,
          warnings: 0,
          info: 0
        },
        overallAssessment: 'Validation could not be completed due to system error',
        sources: ['error']
      };
    }
  }

  /**
   * Generate smart sample for AI validation
   */
  generateValidationSample(data, schema) {
    const maxRows = 100;
    const sample = {
      totalRows: data.length,
      totalColumns: schema.columns.length,
      columns: schema.columns.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        uniqueValues: col.uniqueValues,
        sampleValues: col.sampleValues,
        stats: col.stats || {}
      })),
      measures: schema.measures.map(m => m.name),
      dimensions: schema.dimensions.map(d => d.name),
      dataSnapshot: []
    };

    // Sampling strategy: First 50 + Random 50
    const firstBatch = data.slice(0, Math.min(50, data.length));
    const randomBatch = [];
    
    if (data.length > 50) {
      const step = Math.max(1, Math.floor(data.length / 50));
      for (let i = 50; i < data.length && randomBatch.length < 50; i += step) {
        randomBatch.push(data[i]);
      }
    }

    sample.dataSnapshot = [...firstBatch, ...randomBatch];
    
    return sample;
  }

  /**
   * AI validation using existing aiService infrastructure
   */
  async runAIValidation(sampleData, schema) {
    if (!aiService.apiKey) {
      throw new Error('AI API key not configured');
    }

    console.log('🤖 Sending data to AI for validation...');
    
    const prompt = this.buildValidationPrompt(sampleData);
    
    // Use the existing aiService infrastructure
    const requestPayload = {
      model: "openai/gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert data quality analyst. Analyze datasets and provide validation reports in JSON format. Be thorough but concise."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.3 // Lower temperature for more consistent validation
    };

    try {
      const response = await fetch(aiService.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiService.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload),
        timeout: 30000
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

      return this.parseAIValidationResponse(content);

    } catch (error) {
      console.error('AI validation request failed:', error.message);
      throw error;
    }
  }

  /**
   * Build comprehensive validation prompt for AI
   */
  buildValidationPrompt(sampleData) {
    // Prepare column summary
    const columnSummary = sampleData.columns.map(col => {
      let summary = `- ${col.name} (${col.type})`;
      if (col.stats) {
        if (col.type === 'number' && col.stats.min !== undefined) {
          summary += ` [Range: ${col.stats.min} to ${col.stats.max}]`;
        }
        if (col.stats.uniqueCount) {
          summary += ` [${col.stats.uniqueCount} unique values]`;
        }
      }
      return summary;
    }).join('\n');

    // Sample data preview (first 3 rows)
    const dataPreview = sampleData.dataSnapshot.slice(0, 3)
      .map((row, idx) => `Row ${idx + 1}: ${JSON.stringify(row)}`)
      .join('\n');

    return `Analyze this dataset for quality issues and provide a validation report.

**DATASET SUMMARY:**
- Total Rows: ${sampleData.totalRows.toLocaleString()}
- Total Columns: ${sampleData.totalColumns}
- Sample Analyzed: ${sampleData.dataSnapshot.length} rows

**COLUMNS:**
${columnSummary}

**MEASURES (Numeric):** ${sampleData.measures.join(', ') || 'None'}
**DIMENSIONS (Categorical):** ${sampleData.dimensions.join(', ') || 'None'}

**SAMPLE DATA:**
${dataPreview}

**VALIDATION REQUIREMENTS:**

Analyze for these issues:

1. **Schema Issues:**
   - Missing critical business columns (Date, ID, Amount, etc.)
   - Unusual or unexpected column names
   - Poor naming conventions

2. **Data Type Issues:**
   - Type inconsistencies within columns
   - Text in numeric columns
   - Invalid date formats

3. **Data Quality Issues:**
   - High missing value rates (>20%)
   - Outliers or unrealistic values
   - Negative values where shouldn't exist

4. **Business Logic Issues:**
   - Duplicate IDs or keys
   - Future dates (if not expected)
   - Invalid categorical values
   - Logical inconsistencies

5. **Data Integrity Issues:**
   - Rows with excessive missing values
   - Data corruption indicators

**OUTPUT FORMAT:**

Respond with ONLY valid JSON (no markdown, no code blocks):

{
  "overallStatus": "valid" | "warning" | "error",
  "isReadyForDashboard": true | false,
  "confidence": 0.85,
  "validationResults": [
    {
      "category": "schema" | "datatype" | "quality" | "business" | "integrity",
      "severity": "error" | "warning" | "info",
      "issue": "Brief description of the issue",
      "affectedColumns": ["column_name"],
      "recommendation": "Specific fix suggestion",
      "examples": ["example1", "example2"]
    }
  ],
  "summary": {
    "totalIssues": 3,
    "errors": 0,
    "warnings": 2,
    "info": 1
  },
  "overallAssessment": "One sentence summary of data quality"
}

**SEVERITY RULES:**
- **error**: Critical issues that prevent dashboard creation (wrong types, >50% missing, duplicates in ID columns)
- **warning**: Issues that should be reviewed but won't break dashboard (20-50% missing, minor outliers)
- **info**: Minor observations (<20% missing, optional improvements)

**DECISION:**
- overallStatus="error" if any critical issues → isReadyForDashboard=false
- overallStatus="warning" if only minor issues → isReadyForDashboard=true
- overallStatus="valid" if data is clean → isReadyForDashboard=true

Be specific with column names and provide actionable recommendations.`;
  }

  /**
   * Parse AI validation response
   */
  parseAIValidationResponse(aiResponse) {
    try {
      // Clean response - remove markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      
      // Remove markdown code blocks (both ```json and ``` variants)
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
      cleanedResponse = cleanedResponse.trim();
      
      // Parse JSON
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate required fields
      if (!parsed.overallStatus || !Array.isArray(parsed.validationResults) || !parsed.summary) {
        throw new Error('Invalid AI response structure - missing required fields');
      }
      
      // Validate overallStatus values
      if (!['valid', 'warning', 'error'].includes(parsed.overallStatus)) {
        console.warn('Invalid overallStatus, defaulting to warning');
        parsed.overallStatus = 'warning';
      }
      
      console.log('✅ AI validation parsed successfully');
      
      return {
        source: 'ai',
        ...parsed
      };
      
    } catch (error) {
      console.error('❌ Failed to parse AI validation response:', error.message);
      console.error('Raw response sample:', aiResponse.substring(0, 300));
      throw new Error(`AI response parsing failed: ${error.message}`);
    }
  }

  /**
   * Rule-based validation (fallback/supplement)
   */
  runRuleBasedValidation(data, schema) {
    const issues = [];

    // 1. Missing Values Check
    schema.columns.forEach(col => {
      const columnData = data.map(row => row[col.name]);
      const missingCount = columnData.filter(val => 
        val === null || val === undefined || val === ''
      ).length;
      const missingPercent = (missingCount / data.length) * 100;

      if (missingPercent > 20) {
        issues.push({
          category: 'quality',
          severity: missingPercent > 50 ? 'error' : 'warning',
          issue: `Column "${col.name}" has ${missingPercent.toFixed(1)}% missing values`,
          affectedColumns: [col.name],
          recommendation: `Review and fill missing values in "${col.name}" column`,
          examples: [`${missingCount} of ${data.length} rows are empty`]
        });
      }
    });

    // 2. Data Type Consistency
    schema.columns.forEach(col => {
      if (col.type === 'number') {
        const columnData = data.map(row => row[col.name]).filter(v => v !== null && v !== undefined && v !== '');
        const nonNumeric = columnData.filter(val => typeof val !== 'number' || isNaN(val));
        
        if (nonNumeric.length > 0) {
          issues.push({
            category: 'datatype',
            severity: 'error',
            issue: `Column "${col.name}" should be numeric but contains ${nonNumeric.length} non-numeric values`,
            affectedColumns: [col.name],
            recommendation: `Convert "${col.name}" to numeric or remove invalid entries`,
            examples: nonNumeric.slice(0, 3).map(v => String(v))
          });
        }
      }
    });

    // 3. Duplicate ID Check
    const potentialIdColumns = schema.columns.filter(col => 
      col.name.toLowerCase().includes('id') || 
      col.name.toLowerCase().includes('key') ||
      col.name.toLowerCase().includes('code')
    );
    
    potentialIdColumns.forEach(col => {
      const values = data.map(row => row[col.name]).filter(v => v !== null && v !== undefined && v !== '');
      const uniqueValues = new Set(values);
      
      if (values.length !== uniqueValues.size) {
        const duplicateCount = values.length - uniqueValues.size;
        issues.push({
          category: 'integrity',
          severity: 'error',
          issue: `Column "${col.name}" contains ${duplicateCount} duplicate values (expected unique IDs)`,
          affectedColumns: [col.name],
          recommendation: `Remove or resolve duplicate IDs in "${col.name}"`,
          examples: [`${duplicateCount} duplicate(s) found in ${values.length} records`]
        });
      }
    });

    // 4. Date Validation
    const dateColumns = schema.columns.filter(col => col.type === 'date');
    dateColumns.forEach(col => {
      const dates = data.map(row => {
        const val = row[col.name];
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }).filter(d => d !== null);

      if (dates.length > 0) {
        const now = new Date();
        const futureDates = dates.filter(d => d > now);
        const veryOldDates = dates.filter(d => d.getFullYear() < 1900);

        if (futureDates.length > 0) {
          issues.push({
            category: 'quality',
            severity: 'warning',
            issue: `Column "${col.name}" contains ${futureDates.length} future dates`,
            affectedColumns: [col.name],
            recommendation: `Verify future dates in "${col.name}" are intentional`,
            examples: futureDates.slice(0, 2).map(d => d.toISOString().split('T')[0])
          });
        }

        if (veryOldDates.length > 0) {
          issues.push({
            category: 'quality',
            severity: 'info',
            issue: `Column "${col.name}" has ${veryOldDates.length} dates before 1900`,
            affectedColumns: [col.name],
            recommendation: `Verify historical dates in "${col.name}"`,
            examples: veryOldDates.slice(0, 2).map(d => d.toISOString().split('T')[0])
          });
        }
      }
    });

    // 5. Negative Value Check
    schema.measures.forEach(measure => {
      const shouldBePositive = ['price', 'amount', 'cost', 'quantity', 'count', 'sales', 'revenue', 'total']
        .some(keyword => measure.name.toLowerCase().includes(keyword));

      if (shouldBePositive) {
        const values = data.map(row => row[measure.name])
          .filter(v => typeof v === 'number' && !isNaN(v));
        const negativeValues = values.filter(v => v < 0);

        if (negativeValues.length > 0) {
          issues.push({
            category: 'quality',
            severity: 'warning',
            issue: `Column "${measure.name}" has ${negativeValues.length} negative values (expected positive)`,
            affectedColumns: [measure.name],
            recommendation: `Review negative values in "${measure.name}" - may be data errors`,
            examples: negativeValues.slice(0, 3).map(v => v.toString())
          });
        }
      }
    });

    // Calculate summary
    const summary = {
      totalIssues: issues.length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length
    };

    const hasErrors = summary.errors > 0;

    return {
      source: 'rules',
      overallStatus: hasErrors ? 'error' : (summary.warnings > 0 ? 'warning' : 'valid'),
      isReadyForDashboard: !hasErrors,
      confidence: 1.0,
      validationResults: issues,
      summary,
      overallAssessment: hasErrors 
        ? `Found ${summary.errors} critical error(s) requiring fixes`
        : summary.warnings > 0
          ? `Found ${summary.warnings} warning(s) - review recommended`
          : 'Data quality checks passed'
    };
  }

  /**
   * Merge AI and rule-based results intelligently
   */
  mergeValidationResults(aiResult, ruleResult) {
    if (!aiResult) {
      console.log('📋 Using rule-based validation only (AI unavailable)');
      return ruleResult;
    }

    console.log('🔀 Merging AI and rule-based validation results');

    // Combine issues, avoiding duplicates
    const mergedIssues = [...aiResult.validationResults];
    
    // Add rule-based issues that AI didn't catch
    ruleResult.validationResults.forEach(ruleIssue => {
      const isDuplicate = aiResult.validationResults.some(aiIssue => 
        aiIssue.affectedColumns[0] === ruleIssue.affectedColumns[0] &&
        aiIssue.category === ruleIssue.category &&
        aiIssue.severity === ruleIssue.severity
      );
      
      if (!isDuplicate) {
        mergedIssues.push(ruleIssue);
      }
    });

    // Recalculate summary
    const summary = {
      totalIssues: mergedIssues.length,
      errors: mergedIssues.filter(i => i.severity === 'error').length,
      warnings: mergedIssues.filter(i => i.severity === 'warning').length,
      info: mergedIssues.filter(i => i.severity === 'info').length
    };

    const hasErrors = summary.errors > 0;
    const overallStatus = hasErrors ? 'error' : (summary.warnings > 0 ? 'warning' : 'valid');

    return {
      overallStatus,
      isReadyForDashboard: !hasErrors,
      confidence: aiResult.confidence || 0.85,
      validationResults: mergedIssues,
      summary,
      overallAssessment: aiResult.overallAssessment || ruleResult.overallAssessment,
      sources: ['ai', 'rules']
    };
  }
}

module.exports = new DataValidator();