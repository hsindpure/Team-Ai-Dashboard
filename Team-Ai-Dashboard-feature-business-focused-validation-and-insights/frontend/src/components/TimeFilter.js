// frontend/src/components/TimeFilter.js - Enhanced with Month/Year Selectors
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Select, 
  Card, 
  Space, 
  Typography, 
  Tag, 
  Button, 
  DatePicker,
  Radio,
  Tooltip,
  Statistic,
  Alert,
  Spin,
  Row,
  Col
} from 'antd';
import { 
  CalendarOutlined, 
  ClockCircleOutlined,
  FilterOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
  ClearOutlined,
  BarChartOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const TimeFilter = ({ 
  timeFilters, 
  activeTimeFilter, 
  onTimeFilterChange, 
  isDarkMode,
  loading = false,
  performanceStats = null
}) => {
  const [filterType, setFilterType] = useState('specific'); // 'specific', 'quick', 'custom'
  const [customRange, setCustomRange] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Month names for display
  const monthNames = [
    { value: 1, label: 'January', short: 'Jan' },
    { value: 2, label: 'February', short: 'Feb' },
    { value: 3, label: 'March', short: 'Mar' },
    { value: 4, label: 'April', short: 'Apr' },
    { value: 5, label: 'May', short: 'May' },
    { value: 6, label: 'June', short: 'Jun' },
    { value: 7, label: 'July', short: 'Jul' },
    { value: 8, label: 'August', short: 'Aug' },
    { value: 9, label: 'September', short: 'Sep' },
    { value: 10, label: 'October', short: 'Oct' },
    { value: 11, label: 'November', short: 'Nov' },
    { value: 12, label: 'December', short: 'Dec' }
  ];

  // Initialize filter type and values based on active filter
  useEffect(() => {
    if (activeTimeFilter) {
      if (activeTimeFilter.type === 'custom') {
        setFilterType('custom');
        setCustomRange([
          new Date(activeTimeFilter.startDate),
          new Date(activeTimeFilter.endDate)
        ]);
      } else if (activeTimeFilter.type === 'month') {
        setFilterType('specific');
        setSelectedYear(activeTimeFilter.year);
        setSelectedMonth(activeTimeFilter.month);
      } else if (activeTimeFilter.type === 'year') {
        setFilterType('specific');
        setSelectedYear(activeTimeFilter.year);
        setSelectedMonth(null);
      } else {
        setFilterType('quick');
      }
    } else {
      // Set default to current year and latest available month
      if (timeFilters?.availableFilters?.years?.length > 0) {
        const latestYear = Math.max(...timeFilters.availableFilters.years);
        setSelectedYear(latestYear);
        
        if (timeFilters.availableFilters.months?.length > 0) {
          const latestMonth = Math.max(...timeFilters.availableFilters.months);
          setSelectedMonth(latestMonth);
        }
      }
    }
  }, [activeTimeFilter, timeFilters]);

  // Generate quick filter options
  const quickFilterOptions = useMemo(() => {
    if (!timeFilters?.availableFilters) return [];

    const options = [];
    const { years, months, quarters, monthNames } = timeFilters.availableFilters;
    const granularity = timeFilters.granularity;

    // Add "All Data" option
    options.push({
      key: 'all',
      label: 'All Data',
      value: null,
      description: 'Show all available data'
    });

    // Generate last 6 months/quarters/years for quick access
    if (granularity === 'month') {
      const recentMonths = [];
      years.forEach(year => {
        months.forEach(month => {
          recentMonths.push({ year, month });
        });
      });
      
      // Sort by date and take last 6
      recentMonths.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
      
      recentMonths.slice(0, 6).forEach(({ year, month }) => {
        const monthName = monthNames?.find(m => m.value === month)?.label || `Month ${month}`;
        options.push({
          key: `month-${year}-${month}`,
          label: `${monthName} ${year}`,
          value: { type: 'month', year, month, label: `${monthName} ${year}` }
        });
      });
    }

    return options;
  }, [timeFilters]);

  // Handle specific month/year selection
  const handleSpecificFilterChange = useCallback(() => {
    if (!selectedYear) return;

    let filter;
    if (selectedMonth) {
      // Month filter
      const monthName = monthNames.find(m => m.value === selectedMonth)?.label;
      filter = {
        type: 'month',
        year: selectedYear,
        month: selectedMonth,
        label: `${monthName} ${selectedYear}`
      };
    } else {
      // Year filter
      filter = {
        type: 'year',
        year: selectedYear,
        label: `${selectedYear}`
      };
    }
    
    onTimeFilterChange(filter);
  }, [selectedYear, selectedMonth, onTimeFilterChange, monthNames]);

  // Auto-apply when year/month changes
  useEffect(() => {
    if (filterType === 'specific' && selectedYear) {
      handleSpecificFilterChange();
    }
  }, [filterType, selectedYear, selectedMonth, handleSpecificFilterChange]);

  const handleQuickFilterChange = useCallback((value) => {
    if (value === 'all') {
      onTimeFilterChange(null);
      return;
    }

    const option = quickFilterOptions.find(opt => opt.key === value);
    if (option && option.value) {
      onTimeFilterChange(option.value);
    }
  }, [quickFilterOptions, onTimeFilterChange]);

  const handleCustomRangeChange = useCallback((dates) => {
    setCustomRange(dates);
    if (dates && dates.length === 2) {
      const [startDate, endDate] = dates;
      
      const startDateObj = startDate.toDate ? startDate.toDate() : startDate;
      const endDateObj = endDate.toDate ? endDate.toDate() : endDate;
      
      const customFilter = {
        type: 'custom',
        startDate: startDateObj,
        endDate: endDateObj,
        label: `${formatDate(startDateObj)} - ${formatDate(endDateObj)}`
      };
      onTimeFilterChange(customFilter);
    }
  }, [onTimeFilterChange]);

  const handleClearFilter = useCallback(() => {
    onTimeFilterChange(null);
    setCustomRange(null);
    setSelectedYear(null);
    setSelectedMonth(null);
    setFilterType('specific');
  }, [onTimeFilterChange]);

  // Helper function to format dates
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPerformanceIndicator = () => {
    if (!performanceStats) return null;

    const { filteredRecords, totalRecords, reductionPercentage } = performanceStats;
    const reduction = parseFloat(reductionPercentage);

    if (reduction > 80) {
      return { type: 'success', text: 'Excellent performance boost' };
    } else if (reduction > 50) {
      return { type: 'processing', text: 'Good performance improvement' };
    } else if (reduction > 20) {
      return { type: 'warning', text: 'Moderate performance gain' };
    } else {
      return { type: 'default', text: 'Minimal performance impact' };
    }
  };

  if (!timeFilters || !timeFilters.hasTimeData) {
    return null;
  }

  const performanceIndicator = getPerformanceIndicator();
  const { primaryColumn, dateRange, defaultFilter } = timeFilters;
  const availableYears = timeFilters.availableFilters?.years || [];
  const availableMonths = timeFilters.availableFilters?.months || [];

  return (
    <Card
      size="small"
      style={{
        background: isDarkMode ? '#1f1f1f' : '#fff',
        borderColor: isDarkMode ? '#434343' : '#f0f0f0',
        marginBottom: '16px',
        position: 'relative'
      }}
      bodyStyle={{ padding: '12px 16px' }}
    >
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(24, 144, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          borderRadius: '6px'
        }}>
          <Spin size="small" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarOutlined style={{ color: '#1890ff', fontSize: '16px' }} />
          <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
            Time Filter
          </Text>
          <Tooltip title={`Filtering by ${primaryColumn?.name} column. Large datasets auto-group by month for better performance.`}>
            <InfoCircleOutlined style={{ color: isDarkMode ? '#a0a0a0' : '#666', fontSize: '12px' }} />
          </Tooltip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {performanceIndicator && (
            <Tag color={performanceIndicator.type} size="small">
              <ThunderboltOutlined style={{ marginRight: '2px' }} />
              {performanceIndicator.text}
            </Tag>
          )}
          
          {activeTimeFilter && (
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={handleClearFilter}
              style={{ color: '#ff4d4f' }}
              title="Clear time filter"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Filter Type Selection */}
        <Radio.Group
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          size="small"
          disabled={loading}
        >
          <Radio value="specific">Select Month/Year</Radio>
          <Radio value="quick">Quick Filters</Radio>
          <Radio value="custom">Custom Range</Radio>
        </Radio.Group>

        {/* Specific Month/Year Selectors */}
        {filterType === 'specific' && (
          <div>
            <Row gutter={8}>
              <Col span={12}>
                <div style={{ marginBottom: '8px' }}>
                  <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                    Select Year:
                  </Text>
                </div>
                <Select
                  value={selectedYear}
                  onChange={setSelectedYear}
                  style={{ width: '100%' }}
                  placeholder="Select year"
                  disabled={loading}
                  showSearch
                >
                  {availableYears.map(year => (
                    <Option key={year} value={year}>
                      {year}
                    </Option>
                  ))}
                </Select>
              </Col>
              
              <Col span={12}>
                <div style={{ marginBottom: '8px' }}>
                  <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                    Select Month (Optional):
                  </Text>
                </div>
                <Select
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  style={{ width: '100%' }}
                  placeholder="All months"
                  disabled={loading || !selectedYear}
                  allowClear
                  showSearch
                  filterOption={(input, option) =>
                    option.children.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {monthNames.map(month => (
                    <Option 
                      key={month.value} 
                      value={month.value}
                      disabled={!availableMonths.includes(month.value)}
                    >
                      {month.label}
                    </Option>
                  ))}
                </Select>
              </Col>
            </Row>

            {/* Preview of selected filter */}
            {selectedYear && (
              <div style={{ 
                marginTop: '8px',
                padding: '6px 10px',
                background: isDarkMode ? '#262626' : '#f9f9f9',
                borderRadius: '4px',
                border: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`
              }}>
                <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Showing data for: 
                </Text>
                <Text style={{ fontSize: '12px', color: '#1890ff', fontWeight: 'bold' }}>
                  {selectedMonth 
                    ? `${monthNames.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
                    : `All of ${selectedYear}`
                  }
                </Text>
              </div>
            )}
          </div>
        )}

        {/* Quick Filters */}
        {filterType === 'quick' && (
          <div>
            <Select
              value={quickFilterOptions.find(opt => {
                if (!activeTimeFilter) return 'all';
                if (!opt.value) return false;
                return opt.value.type === activeTimeFilter.type &&
                       opt.value.year === activeTimeFilter.year &&
                       opt.value.month === activeTimeFilter.month;
              })?.key || 'all'}
              onChange={handleQuickFilterChange}
              style={{ width: '100%' }}
              placeholder="Select time period"
              disabled={loading}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
            >
              {quickFilterOptions.map(option => (
                <Option key={option.key} value={option.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{option.label}</span>
                    {option.key === 'all' && (
                      <Tag size="small" color="blue">Default</Tag>
                    )}
                  </div>
                </Option>
              ))}
            </Select>

            {/* Default filter suggestion */}
            {!activeTimeFilter && defaultFilter && (
              <div style={{ marginTop: '8px' }}>
                <Alert
                  message={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px' }}>
                        Suggested: {defaultFilter.label} (Latest data for better performance)
                      </span>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => onTimeFilterChange(defaultFilter)}
                        style={{ padding: 0, height: 'auto' }}
                      >
                        Apply
                      </Button>
                    </div>
                  }
                  type="info"
                  showIcon
                  style={{ fontSize: '11px' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Custom Range */}
        {filterType === 'custom' && (
          <div>
            <RangePicker
              value={customRange}
              onChange={handleCustomRangeChange}
              style={{ width: '100%' }}
              disabled={loading}
              placeholder={['Start Date', 'End Date']}
              format="MMM DD, YYYY"
              allowClear
              disabledDate={(current) => {
                if (!dateRange) return false;
                const currentDate = current.toDate();
                return currentDate < new Date(dateRange.min) || currentDate > new Date(dateRange.max);
              }}
            />
            
            {dateRange && (
              <Text style={{ 
                fontSize: '11px', 
                color: isDarkMode ? '#a0a0a0' : '#666',
                display: 'block',
                marginTop: '4px'
              }}>
                Available range: {formatDate(dateRange.min)} - {formatDate(dateRange.max)}
              </Text>
            )}
          </div>
        )}

        {/* Data Aggregation Notice */}
        {performanceStats && parseInt(performanceStats.reductionPercentage) > 50 && (
          <Alert
            message={
              <div style={{ fontSize: '11px' }}>
                <strong>Smart Data Grouping:</strong> Large datasets are automatically grouped by month 
                for better chart performance. Daily data points are aggregated to monthly totals.
              </div>
            }
            type="info"
            showIcon
            style={{ fontSize: '11px' }}
          />
        )}

        {/* Performance Stats */}
        {performanceStats && (
          <div style={{
            background: isDarkMode ? '#262626' : '#f9f9f9',
            padding: '8px 12px',
            borderRadius: '4px',
            border: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Statistic
                  title={<span style={{ fontSize: '11px', color: isDarkMode ? '#a0a0a0' : '#666' }}>Filtered Records</span>}
                  value={performanceStats.filteredRecords}
                  formatter={(value) => value.toLocaleString()}
                  valueStyle={{ fontSize: '14px', color: isDarkMode ? '#fff' : '#000' }}
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: '11px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Total: {performanceStats.totalRecords?.toLocaleString()}
                </Text>
                <br />
                <Text style={{ 
                  fontSize: '12px', 
                  color: parseFloat(performanceStats.reductionPercentage) > 50 ? '#52c41a' : '#fa8c16',
                  fontWeight: 'bold'
                }}>
                  {performanceStats.reductionPercentage}% reduced
                </Text>
              </div>
            </div>
          </div>
        )}

        {/* Active Filter Display */}
        {activeTimeFilter && (
          <div style={{
            background: isDarkMode ? '#001529' : '#e6f7ff',
            padding: '8px 12px',
            borderRadius: '4px',
            border: `1px solid ${isDarkMode ? '#0958d9' : '#91d5ff'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FilterOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
              <Text style={{ 
                fontSize: '12px', 
                color: isDarkMode ? '#91caff' : '#0958d9',
                fontWeight: 'bold'
              }}>
                Active: {activeTimeFilter.label}
              </Text>
              {activeTimeFilter.type === 'month' && (
                <Tag size="small" color="cyan">Monthly Data</Tag>
              )}
            </div>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default TimeFilter;