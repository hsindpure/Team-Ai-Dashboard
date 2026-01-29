// backend/services/chatbotService.js
// Talk to Data Chatbot Service

class ChatbotService {
    constructor() {
      this.apiKey = process.env.OPENROUTER_API_KEY;
      this.baseUrl = process.env.OPENROUTER_BASE_URL;
      this.model = process.env.AI_MODEL || 'openai/gpt-3.5-turbo';
    }
  
    /**
     * Generate suggested questions from data analysis
     * Called during file upload/validation
     */
    async generateSuggestedQuestions(schema, validationResult, sampleData) {
      console.log('🤖 Generating chatbot questions...');
      
      try {
        const measures = schema.measures.map(m => m.name).join(', ');
        const dimensions = schema.dimensions.map(d => d.name).join(', ');
        const businessDomain = validationResult?.businessDomain || 'Business';
  
        const prompt = `You are analyzing a ${businessDomain} dataset with ${sampleData.length} rows.
  
  COLUMNS:
  - Measures (numeric): ${measures || 'None'}
  - Dimensions (categories): ${dimensions || 'None'}
  
  Generate 6 smart questions users can ask about this data. Return ONLY a JSON array of strings.
  
  QUESTION TYPES:
  1. Total/Sum: "What is the total [measure]?"
  2. Top Rankings: "Show me the top 5 [dimension] by [measure]"
  3. Average: "What is the average [measure] per [dimension]?"
  4. Comparison: "Compare [measure] across [dimension]"
  5. Filtering: "What are the [dimension] where [measure] > X?"
  6. Count: "How many unique [dimension] are there?"
  
  Return format:
  [
    "What is the total revenue?",
    "Show me the top 10 customers by sales",
    ...
  ]`;
  
        const response = await this.callAI(prompt);
        const questions = this.parseJSON(response);
        
        return Array.isArray(questions) ? questions.slice(0, 6) : this.getFallbackQuestions(schema);
        
      } catch (error) {
        console.warn('Question generation failed:', error.message);
        return this.getFallbackQuestions(schema);
      }
    }
  
    /**
     * Process user chat message and generate response
     */
    async processMessage(userMessage, sessionData, conversationHistory = []) {
      console.log('💬 Processing chat message:', userMessage);
  
      try {
        // Step 1: Understand user intent
        const intent = await this.classifyIntent(userMessage, sessionData.schema);
        console.log('🎯 Intent:', intent);
  
        // Step 2: Execute query based on intent
        let response;
        
        if (intent.type === 'table') {
          response = await this.generateTableResponse(userMessage, sessionData, intent);
        } else if (intent.type === 'aggregation') {
          response = await this.generateAggregationResponse(userMessage, sessionData, intent);
        } else if (intent.type === 'insight') {
          response = await this.generateInsightResponse(userMessage, sessionData, conversationHistory);
        } else {
          response = await this.generateGeneralResponse(userMessage, sessionData, conversationHistory);
        }
  
        return response;
  
      } catch (error) {
        console.error('Chat processing error:', error);
        return {
          type: 'text',
          content: "I'm sorry, I encountered an error processing your question. Could you rephrase it?"
        };
      }
    }
  
    /**
     * Classify user intent using AI
     */
    async classifyIntent(userMessage, schema) {
      const measures = schema.measures.map(m => m.name).join(', ');
      const dimensions = schema.dimensions.map(d => d.name).join(', ');
  
      const prompt = `Classify this user question about data:
  
  USER QUESTION: "${userMessage}"
  
  AVAILABLE DATA:
  - Measures: ${measures}
  - Dimensions: ${dimensions}
  
  Classify the intent and extract query details. Return JSON:
  
  {
    "type": "table" | "aggregation" | "insight" | "general",
    "operation": "sum" | "avg" | "count" | "max" | "min" | "filter" | "sort" | "analyze",
    "measure": "column name or null",
    "dimension": "column name or null",
    "filter": {"column": "value"} or null,
    "limit": number or null
  }
  
  INTENT TYPES:
  - "table": User wants to see data rows (e.g., "show me", "list", "display")
  - "aggregation": User wants calculations (e.g., "total", "average", "sum", "count")
  - "insight": User wants analysis (e.g., "why", "trend", "pattern", "insight")
  - "general": Conversational or unclear
  
  Examples:
  "What is the total revenue?" → {"type": "aggregation", "operation": "sum", "measure": "revenue", ...}
  "Show me top 10 customers" → {"type": "table", "operation": "sort", "limit": 10, ...}
  "Why is sales declining?" → {"type": "insight", "operation": "analyze", ...}
  
  Return ONLY valid JSON.`;
  
      const response = await this.callAI(prompt);
      const intent = this.parseJSON(response);
      
      return intent || { type: 'general', operation: null };
    }
  
    /**
     * Generate table response
     */
    async generateTableResponse(userMessage, sessionData, intent) {
      const { data, schema } = sessionData;
      
      // Apply filters if specified
      let filteredData = data;
      if (intent.filter) {
        const filterCol = Object.keys(intent.filter)[0];
        const filterVal = intent.filter[filterCol];
        filteredData = data.filter(row => 
          String(row[filterCol]).toLowerCase().includes(String(filterVal).toLowerCase())
        );
      }
  
      // Apply sorting if dimension specified
      if (intent.dimension && intent.measure) {
        filteredData = filteredData.sort((a, b) => {
          const valA = parseFloat(a[intent.measure]) || 0;
          const valB = parseFloat(b[intent.measure]) || 0;
          return valB - valA; // Descending
        });
      }
  
      // Apply limit
      const limit = intent.limit || 10;
      const resultData = filteredData.slice(0, limit);
  
      // Determine which columns to show
      let columns = [];
      if (intent.dimension && schema.dimensions.find(d => d.name === intent.dimension)) {
        columns.push(intent.dimension);
      }
      if (intent.measure && schema.measures.find(m => m.name === intent.measure)) {
        columns.push(intent.measure);
      }
      
      // If no specific columns, show first few
      if (columns.length === 0) {
        columns = Object.keys(resultData[0] || {}).slice(0, 5);
      }
  
      // Format table data
      const tableData = resultData.map((row, idx) => {
        const formattedRow = { _id: idx };
        columns.forEach(col => {
          formattedRow[col] = row[col];
        });
        return formattedRow;
      });
  
      return {
        type: 'table',
        content: `Here are the ${tableData.length} results:`,
        table: {
          columns: columns.map(col => ({
            title: this.formatColumnName(col),
            dataIndex: col,
            key: col
          })),
          data: tableData
        },
        summary: `Showing ${tableData.length} of ${filteredData.length} total rows.`
      };
    }
  
    /**
     * Generate aggregation response
     */
    async generateAggregationResponse(userMessage, sessionData, intent) {
      const { data, schema } = sessionData;
      
      const measure = intent.measure || schema.measures[0]?.name;
      const dimension = intent.dimension;
      
      if (!measure) {
        return {
          type: 'text',
          content: "I couldn't identify which measure to calculate. Could you specify?"
        };
      }
  
      let result;
      
      if (dimension) {
        // Group by dimension
        const grouped = this.groupBy(data, dimension);
        const aggregated = Object.keys(grouped).map(key => ({
          [dimension]: key,
          [measure]: this.calculateAggregation(grouped[key], measure, intent.operation)
        }));
        
        // Sort by measure
        aggregated.sort((a, b) => b[measure] - a[measure]);
        
        // Take top 10
        const topResults = aggregated.slice(0, 10);
        
        return {
          type: 'table',
          content: `Here's the ${intent.operation || 'total'} ${this.formatColumnName(measure)} by ${this.formatColumnName(dimension)}:`,
          table: {
            columns: [
              { title: this.formatColumnName(dimension), dataIndex: dimension, key: dimension },
              { title: this.formatColumnName(measure), dataIndex: measure, key: measure }
            ],
            data: topResults.map((row, idx) => ({ ...row, _id: idx }))
          }
        };
        
      } else {
        // Single aggregation
        const value = this.calculateAggregation(data, measure, intent.operation);
        const formatted = this.formatValue(value, measure);
        
        return {
          type: 'text',
          content: `The ${intent.operation || 'total'} ${this.formatColumnName(measure)} is **${formatted}**.`
        };
      }
    }
  
    /**
     * Generate insight response using AI
     */
    async generateInsightResponse(userMessage, sessionData, conversationHistory) {
      const { schema, stats } = sessionData;
      
      const measures = schema.measures.map(m => m.name).join(', ');
      const dimensions = schema.dimensions.map(d => d.name).join(', ');
      
      // Build conversation context
      const historyContext = conversationHistory.slice(-4).map(msg => 
        `${msg.role}: ${msg.content}`
      ).join('\n');
  
      const prompt = `You are a business analyst chatbot helping users understand their data.
  
  DATASET INFO:
  - Total Rows: ${stats.totalRows}
  - Measures: ${measures}
  - Dimensions: ${dimensions}
  
  CONVERSATION HISTORY:
  ${historyContext}
  
  USER QUESTION: "${userMessage}"
  
  Provide a thoughtful, business-focused answer. Be concise (2-3 sentences).
  If you need specific data, say "Let me calculate that" and suggest a specific query.
  
  Response:`;
  
      const response = await this.callAI(prompt);
      
      return {
        type: 'text',
        content: response
      };
    }
  
    /**
     * Generate general response
     */
    async generateGeneralResponse(userMessage, sessionData, conversationHistory) {
      return this.generateInsightResponse(userMessage, sessionData, conversationHistory);
    }
  
    // ==================== HELPER FUNCTIONS ====================
  
    /**
     * Call OpenRouter AI API
     */
    async callAI(prompt, systemMessage = null) {
      const messages = [];
      
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }
      
      messages.push({ role: 'user', content: prompt });
  
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          max_tokens: 1500,
          temperature: 0.7
        })
      });
  
      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }
  
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  
    /**
     * Parse JSON from AI response
     */
    parseJSON(text) {
      try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        return JSON.parse(jsonStr);
      } catch (error) {
        console.warn('JSON parse error:', error.message);
        return null;
      }
    }
  
    /**
     * Group data by dimension
     */
    groupBy(data, dimension) {
      const groups = {};
      data.forEach(row => {
        const key = row[dimension] || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });
      return groups;
    }
  
    /**
     * Calculate aggregation
     */
    calculateAggregation(data, measure, operation = 'sum') {
      const values = data.map(row => parseFloat(row[measure])).filter(v => !isNaN(v));
      
      if (values.length === 0) return 0;
      
      switch (operation) {
        case 'sum':
          return values.reduce((sum, val) => sum + val, 0);
        case 'avg':
        case 'average':
          return values.reduce((sum, val) => sum + val, 0) / values.length;
        case 'count':
          return values.length;
        case 'max':
          return Math.max(...values);
        case 'min':
          return Math.min(...values);
        default:
          return values.reduce((sum, val) => sum + val, 0);
      }
    }
  
    /**
     * Format column name
     */
    formatColumnName(name) {
      return name
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
  
    /**
     * Format value for display
     */
    formatValue(value, columnName) {
      const name = columnName.toLowerCase();
      
      if (name.includes('revenue') || name.includes('sales') || name.includes('price')) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0
        }).format(value);
      }
      
      if (value >= 1000000) {
        return (value / 1000000).toFixed(2) + 'M';
      } else if (value >= 1000) {
        return (value / 1000).toFixed(2) + 'K';
      }
      
      return value.toLocaleString();
    }
  
    /**
     * Fallback questions when AI fails
     */
    getFallbackQuestions(schema) {
      const questions = [];
      
      if (schema.measures.length > 0) {
        const measure = schema.measures[0].name;
        questions.push(`What is the total ${this.formatColumnName(measure)}?`);
        questions.push(`What is the average ${this.formatColumnName(measure)}?`);
      }
      
      if (schema.dimensions.length > 0 && schema.measures.length > 0) {
        const dim = schema.dimensions[0].name;
        const measure = schema.measures[0].name;
        questions.push(`Show me the top 10 ${this.formatColumnName(dim)} by ${this.formatColumnName(measure)}`);
        questions.push(`How many unique ${this.formatColumnName(dim)} are there?`);
      }
      
      if (schema.dimensions.length > 0) {
        questions.push(`Show me all unique ${this.formatColumnName(schema.dimensions[0].name)}`);
      }
      
      questions.push('What insights can you provide about this data?');
      
      return questions.slice(0, 6);
    }
  }
  
  module.exports = new ChatbotService();
