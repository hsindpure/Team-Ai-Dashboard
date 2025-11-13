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

    const systemPrompt = "You are an expert data quality analyst. Analyze datasets and provide validation reports in JSON format. Be thorough but concise.";
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    // Use Gemini API format
    const requestPayload = {
      model: 'openai/gpt-3.5-turbo', // Use the same model from aiService
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000, // Validation needs more tokens
      temperature: 0.3  // Lower temperature for more consistent validation
    };


    try {
      const response = await fetch(`${process.env.OPENROUTER_BASE_URL}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        timeout: 3000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

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

    const samplePercent = ((sampleData.dataSnapshot.length / sampleData.totalRows) * 100).toFixed(1);

    return `You are a business analyst expert helping executives understand their data. Analyze this dataset and provide BUSINESS INSIGHTS, not technical statistics.

**CONTEXT:** Analyzing SAMPLE of ${sampleData.dataSnapshot.length} rows (${samplePercent}% of ${sampleData.totalRows.toLocaleString()} total).

**DATASET:**
${columnSummary}

**MEASURES:** ${sampleData.measures.join(', ') || 'None'}
**DIMENSIONS:** ${sampleData.dimensions.join(', ') || 'None'}

**SAMPLE DATA:**
${dataPreview}

**YOUR TASK - THINK LIKE A BUSINESS ANALYST:**

1. **IDENTIFY THE BUSINESS DOMAIN:** What type of business data is this? (Sales, HR, Finance, Marketing, Operations, Customer, etc.)

2. **DATA QUALITY SCORE (0-100):** Calculate overall quality (90+=Excellent, 70-89=Good, 50-69=Fair, 30-49=Poor, <30=Critical)

3. **STRENGTHS (3-5 BUSINESS-FOCUSED):**
   - What business questions CAN be answered with this data?
   - What time periods/trends are covered?
   - What business metrics are reliable?
   Example: "3-year revenue history enables YoY growth analysis" NOT "Complete date column"

4. **KEY BUSINESS INSIGHTS (3-5):**
   - What patterns, trends, or business opportunities do you see in the sample?
   - What can executives learn from this data?
   - Are there growth trends, declining areas, seasonal patterns, top performers, problem areas?
   Examples:
   - "Revenue appears concentrated in Q4 - potential seasonal business"
   - "Top 3 regions account for 60% of sales - geographic opportunity exists"
   - "Customer retention dropping after 6 months - churn risk identified"
   - "Product category X has 3x higher margins than category Y"
   - "Weekend sales 40% lower - staffing optimization opportunity"

   DO NOT say generic things like "8 balanced categories" or "good data distribution"

5. **WHAT THIS DATA CAN ANSWER (Business Questions):**
   List 3-4 specific business questions this dataset can help answer:
   - "Which products/regions/customers drive the most revenue?"
   - "Are we growing or declining over time?"
   - "What are our seasonal patterns?"
   - "Where are the biggest opportunities or risks?"

6. **VISUALIZATION RECOMMENDATIONS (3-4):**
   Focus on BUSINESS STORYTELLING not just chart types:
   Example:
   - chartType: "line", reason: "Track revenue growth trajectory over 3 years to identify inflection points"
   - chartType: "bar", reason: "Compare regional performance to find expansion opportunities"
   NOT just "Daily dates with range shows trends"

7. **SEVERITY LEVELS FOR ISSUES:**
   - **critical**: ONLY severe data corruption (blocks dashboard, score <30)
   - **moderate**: Significant issues (allows with warning, score 30-70)
   - **minor**: Common issues, still usable (informational, score >70)
   IMPORTANT: Missing values are NEVER critical - they're normal in business data

**OUTPUT (JSON only, no markdown):**
{
  "dataQualityScore": 85,
  "scoreCategory": "Good",
  "visualizationReadiness": "ready",
  "overallStatus": "valid",
  "isReadyForDashboard": true,
  "confidence": 0.90,
  "businessDomain": "E-commerce Sales",
  "strengths": [
    "Complete 3-year transaction history enables trend analysis and forecasting",
    "Product and customer dimensions allow segmentation and targeting strategies",
    "Revenue and cost data support margin analysis and profitability insights"
  ],
  "insights": [
    "Revenue grew 45% from 2021 to 2023 - strong upward trajectory suggesting successful growth strategy",
    "Electronics category shows 2.5x higher average order value than Apparel - premium product opportunity",
    "Peak sales occur in November-December (holiday season) - 35% of annual revenue in Q4",
    "Repeat customers contribute 65% of revenue despite being only 30% of customer base - loyalty is key driver"
  ],
  "businessQuestions": [
    "Which product categories have the highest profit margins and should we invest more?",
    "What is our customer retention rate and lifetime value by segment?",
    "Are there seasonal patterns we can leverage for inventory planning?",
    "Which geographic regions offer the biggest growth opportunities?"
  ],
  "validationResults": [{
    "category": "quality",
    "severity": "minor",
    "issue": "Customer email 35% missing in sample",
    "affectedColumns": ["customer_email"],
    "recommendation": "Guest checkout common in e-commerce - use Customer ID for tracking",
    "dashboardImpact": "Can still analyze purchase patterns by Customer ID; email marketing reach may be limited",
    "canWorkAround": true,
    "cleaningSuggestion": "Track marketing opt-in separately; focus on Customer ID-based retention analysis"
  }],
  "visualizationRecommendations": [{
    "chartType": "line",
    "reason": "Track monthly revenue trend to identify growth acceleration and seasonality patterns for forecasting",
    "bestColumns": ["order_date", "revenue"],
    "caveat": "Consider year-over-year comparison to account for seasonal effects"
  }, {
    "chartType": "bar",
    "reason": "Compare product category performance to identify high-margin opportunities and underperformers",
    "bestColumns": ["product_category", "revenue", "profit_margin"]
  }, {
    "chartType": "pie",
    "reason": "Visualize customer segment revenue mix to prioritize retention vs acquisition strategies",
    "bestColumns": ["customer_segment", "revenue"]
  }],
  "performanceWarnings": [],
  "summary": {"totalIssues": 2, "critical": 0, "moderate": 0, "minor": 2},
  "overallAssessment": "Excellent e-commerce dataset ready for business intelligence. Strong revenue growth visible, seasonality patterns clear, customer segmentation possible. Minor missing emails don't affect core analysis."
}

**CRITICAL RULES:**
- ALWAYS identify the business domain (Sales/HR/Finance/etc.) in "businessDomain" field
- "insights" must be BUSINESS insights (growth, trends, opportunities) NOT technical stats
- "businessQuestions" must be specific questions executives would ask
- Think: "What would a CEO/VP want to know from this data?"
- isReadyForDashboard=false ONLY if score<30 OR critical corruption exists`;
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

    // 1. Missing Values Check - Relaxed Thresholds
    schema.columns.forEach(col => {
      const columnData = data.map(row => row[col.name]);
      const missingCount = columnData.filter(val =>
        val === null || val === undefined || val === ''
      ).length;
      const missingPercent = (missingCount / data.length) * 100;

      // Missing values are informational only - never block dashboard creation
      if (missingPercent > 30) {
        let severity, recommendation;

        // Missing values are always minor - they're common and workable
        if (missingPercent > 80) {
          severity = 'minor';
          recommendation = `Column "${col.name}" is mostly empty (${missingPercent.toFixed(0)}%) - consider using alternative columns or removing this column from visualizations`;
        } else if (missingPercent > 50) {
          severity = 'minor';
          recommendation = `Column "${col.name}" has significant missing data (${missingPercent.toFixed(0)}%) - charts will filter out or show as 'Unknown'`;
        } else {
          severity = 'minor';
          recommendation = `Column "${col.name}" has some missing data (${missingPercent.toFixed(0)}%) - visualizations will handle this gracefully`;
        }

        issues.push({
          category: 'quality',
          severity: severity,
          issue: `Column "${col.name}" has ${missingPercent.toFixed(1)}% missing values`,
          affectedColumns: [col.name],
          recommendation: recommendation,
          examples: [`${missingCount} of ${data.length} rows are empty`],
          dashboardImpact: missingPercent > 80 ?
            `Charts using this column will have very limited data (only ${(100 - missingPercent).toFixed(0)}% populated) - still usable but consider alternatives` :
            `Charts will show 'Unknown' or filter null values for ${missingPercent.toFixed(0)}% of data points - this is normal and workable`,
          canWorkAround: true  // Missing values are always workable in dashboards
        });
      }
    });

    // 2. Data Type Consistency - Threshold-based
    schema.columns.forEach(col => {
      if (col.type === 'number') {
        const columnData = data.map(row => row[col.name]).filter(v => v !== null && v !== undefined && v !== '');
        const nonNumeric = columnData.filter(val => typeof val !== 'number' || isNaN(val));

        if (nonNumeric.length > 0 && columnData.length > 0) {
          const errorPercent = (nonNumeric.length / columnData.length) * 100;
          let severity, recommendation;

          if (errorPercent > 30) {
            severity = 'critical';
            recommendation = `Column "${col.name}" has too many non-numeric values (${errorPercent.toFixed(0)}%) - verify column data type or fix data source`;
          } else if (errorPercent > 10) {
            severity = 'moderate';
            recommendation = `Column "${col.name}" has some non-numeric values (${errorPercent.toFixed(0)}%) - consider filtering these out or converting to numeric`;
          } else {
            severity = 'minor';
            recommendation = `Column "${col.name}" has few non-numeric values (${errorPercent.toFixed(0)}%) - can filter these rows out in visualizations`;
          }

          issues.push({
            category: 'datatype',
            severity: severity,
            issue: `Column "${col.name}" should be numeric but contains ${nonNumeric.length} non-numeric values (${errorPercent.toFixed(1)}% of data)`,
            affectedColumns: [col.name],
            recommendation: recommendation,
            examples: nonNumeric.slice(0, 3).map(v => String(v)),
            dashboardImpact: errorPercent > 30 ?
              `Cannot aggregate this column - charts will fail or show incorrect totals` :
              `Some rows will be excluded from calculations (${errorPercent.toFixed(0)}% of data)`,
            canWorkAround: errorPercent <= 30
          });
        }
      }
    });

    // 3. Duplicate ID Check - Contextual
    const potentialIdColumns = schema.columns.filter(col =>
      col.name.toLowerCase().includes('id') ||
      col.name.toLowerCase().includes('key') ||
      col.name.toLowerCase().includes('code')
    );

    potentialIdColumns.forEach(col => {
      const values = data.map(row => row[col.name]).filter(v => v !== null && v !== undefined && v !== '');
      const uniqueValues = new Set(values);

      if (values.length !== uniqueValues.size && values.length > 0) {
        const duplicateCount = values.length - uniqueValues.size;
        const duplicatePercent = (duplicateCount / values.length) * 100;

        // Relaxed duplicate checking - only flag primary keys with severe duplication
        const isPrimaryKey = (
          col.name.toLowerCase() === 'id' ||
          col.name.toLowerCase() === 'primary_key' ||
          col.name.toLowerCase() === 'pk' ||
          col.name.toLowerCase().endsWith('_id') && col.name.toLowerCase() !== 'user_id' && col.name.toLowerCase() !== 'product_id'
        );

        let severity, recommendation, dashboardImpact;

        // Only flag as critical if it's a primary key AND has >80% duplicates (severe corruption)
        if (isPrimaryKey && duplicatePercent > 80) {
          severity = 'critical';
          recommendation = `Column "${col.name}" appears to be a primary key but has ${duplicatePercent.toFixed(0)}% duplicates - indicates severe data corruption`;
          dashboardImpact = 'Cannot use this column as unique identifier - row counts and aggregations will be incorrect';
        } else if (isPrimaryKey && duplicatePercent > 50) {
          severity = 'moderate';
          recommendation = `Column "${col.name}" may be a primary key with ${duplicatePercent.toFixed(0)}% duplicates - verify data integrity`;
          dashboardImpact = 'May affect unique record counts - consider using as dimension instead';
        } else {
          // All other cases: duplicates are normal (categories, foreign keys, repeated values)
          severity = 'minor';
          recommendation = `Column "${col.name}" has ${duplicatePercent.toFixed(0)}% duplicates - likely categories, foreign keys, or repeated business values`;
          dashboardImpact = 'Normal duplication - works well for grouping and categorization in visualizations';
        }

        issues.push({
          category: 'integrity',
          severity: severity,
          issue: `Column "${col.name}" contains ${duplicateCount} duplicate values (${duplicatePercent.toFixed(1)}% duplication rate)`,
          affectedColumns: [col.name],
          recommendation: recommendation,
          examples: [`${duplicateCount} duplicate(s) found in ${values.length} records`],
          dashboardImpact: dashboardImpact,
          canWorkAround: true  // Duplicates are almost always workable in dashboards
        });
      }
    });

    // 4. Date Validation - Business Friendly
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
        const tenYearsFromNow = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
        const veryFutureDates = dates.filter(d => d > tenYearsFromNow);
        const nearFutureDates = dates.filter(d => d > now && d <= tenYearsFromNow);
        const veryOldDates = dates.filter(d => d.getFullYear() < 1800);
        const oldDates = dates.filter(d => d.getFullYear() >= 1800 && d.getFullYear() < 1900);

        // Only flag very suspicious future dates
        if (veryFutureDates.length > 0) {
          issues.push({
            category: 'quality',
            severity: 'moderate',
            issue: `Column "${col.name}" contains ${veryFutureDates.length} dates more than 10 years in the future`,
            affectedColumns: [col.name],
            recommendation: `Verify these far-future dates in "${col.name}" - may be date parsing errors`,
            examples: veryFutureDates.slice(0, 2).map(d => d.toISOString().split('T')[0]),
            dashboardImpact: 'Timeline charts may have unusual date ranges',
            canWorkAround: true
          });
        }

        // Near-future dates are informational (common for forecasts/schedules)
        if (nearFutureDates.length > 0 && veryFutureDates.length === 0) {
          issues.push({
            category: 'quality',
            severity: 'minor',
            issue: `Column "${col.name}" contains ${nearFutureDates.length} future dates (within next 10 years)`,
            affectedColumns: [col.name],
            recommendation: `Future dates detected - likely forecasts, bookings, or scheduled events`,
            examples: nearFutureDates.slice(0, 2).map(d => d.toISOString().split('T')[0]),
            dashboardImpact: 'Charts will include future dates - normal for planning/forecasting data',
            canWorkAround: true
          });
        }

        // Very old dates may indicate parsing errors
        if (veryOldDates.length > 0) {
          issues.push({
            category: 'quality',
            severity: 'moderate',
            issue: `Column "${col.name}" has ${veryOldDates.length} dates before 1800`,
            affectedColumns: [col.name],
            recommendation: `Verify pre-1800 dates - may be date format parsing errors`,
            examples: veryOldDates.slice(0, 2).map(d => d.toISOString().split('T')[0]),
            dashboardImpact: 'May skew timeline visualizations if errors',
            canWorkAround: true
          });
        }

        // Historical dates (1800-1900) are fine
        if (oldDates.length > 0 && veryOldDates.length === 0) {
          issues.push({
            category: 'quality',
            severity: 'minor',
            issue: `Column "${col.name}" has ${oldDates.length} historical dates (1800-1900)`,
            affectedColumns: [col.name],
            recommendation: `Historical data detected - valid for historical analysis`,
            examples: oldDates.slice(0, 2).map(d => d.toISOString().split('T')[0]),
            dashboardImpact: 'Timeline will span historical periods - expected for historical datasets',
            canWorkAround: true
          });
        }
      }
    });

    // 5. Negative Value Check - Context Aware
    schema.measures.forEach(measure => {
      const shouldBePositive = ['price', 'amount', 'cost', 'quantity', 'count', 'sales', 'revenue', 'total']
        .some(keyword => measure.name.toLowerCase().includes(keyword));

      if (shouldBePositive) {
        const values = data.map(row => row[measure.name])
          .filter(v => typeof v === 'number' && !isNaN(v));
        const negativeValues = values.filter(v => v < 0);

        if (negativeValues.length > 0 && values.length > 0) {
          const negativePercent = (negativeValues.length / values.length) * 100;

          issues.push({
            category: 'quality',
            severity: 'minor',
            issue: `Column "${measure.name}" has ${negativeValues.length} negative values (${negativePercent.toFixed(1)}% of numeric data)`,
            affectedColumns: [measure.name],
            recommendation: `Review negative values in "${measure.name}" - may be legitimate (refunds, returns, adjustments, deltas) or data errors`,
            examples: negativeValues.slice(0, 3).map(v => v.toString()),
            dashboardImpact: 'Negative values will appear in charts - normal for refunds/adjustments, verify if unexpected',
            canWorkAround: true
          });
        }
      }
    });

    // 6. Business Logic Informational Checks (non-blocking)

    // Check for potential performance warnings with large datasets
    if (data.length > 50000) {
      issues.push({
        category: 'quality',
        severity: 'minor',
        issue: `Dataset has ${data.length.toLocaleString()} rows - large dataset detected`,
        affectedColumns: [],
        recommendation: `Dashboard will use aggregated views and data limits for performance`,
        examples: [`Total rows: ${data.length.toLocaleString()}`],
        dashboardImpact: 'Charts will be optimized with aggregation and sampling for performance',
        canWorkAround: true
      });
    }

    // Check for high cardinality dimensions
    schema.dimensions.forEach(dim => {
      if (dim.uniqueValues > 1000) {
        issues.push({
          category: 'quality',
          severity: 'minor',
          issue: `Dimension "${dim.name}" has high cardinality (${dim.uniqueValues.toLocaleString()} unique values)`,
          affectedColumns: [dim.name],
          recommendation: `Consider filtering to top categories for "${dim.name}" in visualizations`,
          examples: [`${dim.uniqueValues.toLocaleString()} unique values detected`],
          dashboardImpact: 'Bar/pie charts may be cluttered - filter to top 20-50 values recommended',
          canWorkAround: true
        });
      }
    });

    // Calculate summary with new severity levels
    const summary = {
      totalIssues: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      moderate: issues.filter(i => i.severity === 'moderate').length,
      minor: issues.filter(i => i.severity === 'minor').length
    };

    const hasCritical = summary.critical > 0;

    // Calculate quality score based on issues
    const qualityScore = this.calculateQualityScore(summary);

    return {
      source: 'rules',
      dataQualityScore: qualityScore,
      scoreCategory: this.getScoreCategory(qualityScore),
      visualizationReadiness: hasCritical || qualityScore < 50 ? 'not-recommended' : (summary.moderate > 0 ? 'usable-with-caution' : 'ready'),
      overallStatus: hasCritical ? 'critical' : (summary.moderate > 0 ? 'warning' : 'valid'),
      isReadyForDashboard: !hasCritical && qualityScore >= 50,
      confidence: 1.0,
      validationResults: issues,
      summary,
      overallAssessment: hasCritical
        ? `Found ${summary.critical} critical issue(s) - data quality too low for reliable dashboards`
        : summary.moderate > 0
          ? `Found ${summary.moderate} moderate issue(s) - review recommended but dashboard creation allowed`
          : summary.minor > 0
            ? `Found ${summary.minor} minor observation(s) - data quality is good`
            : 'Data quality checks passed - excellent data quality'
    };
  }

  /**
   * Calculate data quality score from summary
   */
  calculateQualityScore(summary) {
    let score = 100;
    score -= summary.critical * 30;  // -30 per critical issue
    score -= summary.moderate * 10;  // -10 per moderate issue
    score -= summary.minor * 2;      // -2 per minor issue
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get score category label
   */
  getScoreCategory(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 30) return 'Poor';
    return 'Critical';
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

    // Recalculate summary with new severity levels
    const summary = {
      totalIssues: mergedIssues.length,
      critical: mergedIssues.filter(i => i.severity === 'critical').length,
      moderate: mergedIssues.filter(i => i.severity === 'moderate').length,
      minor: mergedIssues.filter(i => i.severity === 'minor').length
    };

    const hasCritical = summary.critical > 0;

    // Use AI's quality score if available, otherwise calculate from summary
    const dataQualityScore = aiResult.dataQualityScore || this.calculateQualityScore(summary);
    const scoreCategory = aiResult.scoreCategory || this.getScoreCategory(dataQualityScore);

    const overallStatus = hasCritical ? 'critical' : (summary.moderate > 0 ? 'warning' : 'valid');

    return {
      dataQualityScore,
      scoreCategory,
      visualizationReadiness: aiResult.visualizationReadiness || (hasCritical || dataQualityScore < 50 ? 'not-recommended' : (summary.moderate > 0 ? 'usable-with-caution' : 'ready')),
      overallStatus,
      isReadyForDashboard: !hasCritical && dataQualityScore >= 50,
      confidence: aiResult.confidence || 0.85,
      validationResults: mergedIssues,
      summary,
      overallAssessment: aiResult.overallAssessment || ruleResult.overallAssessment,
      strengths: aiResult.strengths || [],
      insights: aiResult.insights || [],
      visualizationRecommendations: aiResult.visualizationRecommendations || [],
      performanceWarnings: aiResult.performanceWarnings || [],
      sources: ['ai', 'rules']
    };
  }
}

module.exports = new DataValidator();