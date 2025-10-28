// frontend/src/components/DashboardFilterBar.js
import React, { useState, useCallback, useMemo } from 'react';
import { 
  Card, 
  Select, 
  Row, 
  Col, 
  Typography, 
  Tag, 
  Button, 
  Space,
  Tooltip,
  Spin
} from 'antd';
import { 
  FilterOutlined,
  ClearOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { Text } = Typography;

const DashboardFilterBar = ({
  timeFilters,
  filterOptions,
  activeFilters,
  activeTimeFilter,
  dataLimit,
  onFilterChange,
  onTimeFilterChange,
  onDataLimitChange,
  performanceInfo,
  isDarkMode,
  loading = false
}) => {
  const [localFilters, setLocalFilters] = useState(activeFilters || {});

  // Month options for time filtering
  const monthOptions = [
    { value: null, label: 'All Months' },
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  // Data limit options
  const dataLimitOptions = [
    { label: 'Top 50 Records', value: 50 },
    { label: 'Top 100 Records', value: 100 },
    { label: 'Top 1,000 Records', value: 1000 },
    { label: 'Top 10,000 Records', value: 10000 },
    { label: 'All Data', value: null }
  ];

  // Handle year selection
  const handleYearChange = useCallback((year) => {
    if (!year) {
      onTimeFilterChange(null);
      return;
    }

    const currentMonth = activeTimeFilter?.month || null;
    const timeFilter = currentMonth ? {
      type: 'month',
      year: year,
      month: currentMonth,
      label: `${monthOptions.find(m => m.value === currentMonth)?.label} ${year}`
    } : {
      type: 'year',
      year: year,
      label: `${year}`
    };

    onTimeFilterChange(timeFilter);
  }, [activeTimeFilter, onTimeFilterChange, monthOptions]);

  // Handle month selection
  const handleMonthChange = useCallback((month) => {
    const currentYear = activeTimeFilter?.year || (timeFilters?.availableFilters?.years?.[0]);
    
    if (!month || !currentYear) {
      if (currentYear) {
        onTimeFilterChange({
          type: 'year',
          year: currentYear,
          label: `${currentYear}`
        });
      } else {
        onTimeFilterChange(null);
      }
      return;
    }

    const timeFilter = {
      type: 'month',
      year: currentYear,
      month: month,
      label: `${monthOptions.find(m => m.value === month)?.label} ${currentYear}`
    };

    onTimeFilterChange(timeFilter);
  }, [activeTimeFilter, timeFilters, onTimeFilterChange, monthOptions]);

  // Handle regular filter change
  const handleFilterChange = useCallback((filterKey, values) => {
    const newFilters = { ...localFilters };
    
    if (!values || values.length === 0) {
      delete newFilters[filterKey];
    } else {
      newFilters[filterKey] = values;
    }
    
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  }, [localFilters, onFilterChange]);

  // Clear all filters
  const handleClearAll = useCallback(() => {
    setLocalFilters({});
    onFilterChange({});
    onTimeFilterChange(null);
  }, [onFilterChange, onTimeFilterChange]);

  // Calculate total active filters
  const totalActiveFilters = useMemo(() => {
    const regularFilters = Object.keys(localFilters).length;
    const timeFilterActive = activeTimeFilter ? 1 : 0;
    return regularFilters + timeFilterActive;
  }, [localFilters, activeTimeFilter]);

  // Get available years and months
  const availableYears = timeFilters?.availableFilters?.years || [];
  const availableMonths = timeFilters?.availableFilters?.months || [];

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

      <Row gutter={[16, 8]} align="middle">
        {/* Filter Header */}
        <Col xs={24} sm={4}>
          <Space>
            <FilterOutlined style={{ color: '#1890ff', fontSize: '16px' }} />
            <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
              Filters
            </Text>
            {totalActiveFilters > 0 && (
              <Tag color="blue" size="small">
                {totalActiveFilters} active
              </Tag>
            )}
          </Space>
        </Col>

        {/* Time Filters */}
        {timeFilters?.hasTimeData && (
          <>
            <Col xs={12} sm={3}>
              <div>
                <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Year:
                </Text>
                <Select
                  value={activeTimeFilter?.year || null}
                  onChange={handleYearChange}
                  style={{ width: '100%', marginTop: '2px' }}
                  placeholder="All years"
                  size="small"
                  allowClear
                  disabled={loading}
                >
                  {availableYears.map(year => (
                    <Option key={year} value={year}>
                      {year}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>

            <Col xs={12} sm={3}>
              <div>
                <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Month:
                </Text>
                <Select
                  value={activeTimeFilter?.month || null}
                  onChange={handleMonthChange}
                  style={{ width: '100%', marginTop: '2px' }}
                  placeholder="All months"
                  size="small"
                  allowClear
                  disabled={loading || !activeTimeFilter?.year}
                >
                  {monthOptions.map(month => (
                    <Option 
                      key={month.value || 'all'} 
                      value={month.value}
                      disabled={month.value && !availableMonths.includes(month.value)}
                    >
                      {month.label}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>
          </>
        )}

        {/* Regular Filters */}
        {filterOptions && Object.entries(filterOptions).slice(0, 3).map(([filterKey, filterData]) => (
          <Col xs={12} sm={3} key={filterKey}>
            <div>
              <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                {filterData.label}:
              </Text>
              <Select
                mode="multiple"
                value={localFilters[filterKey] || []}
                onChange={(values) => handleFilterChange(filterKey, values)}
                style={{ width: '100%', marginTop: '2px' }}
                placeholder={`All ${filterData.label.toLowerCase()}`}
                size="small"
                allowClear
                disabled={loading}
                maxTagCount="responsive"
                showSearch
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
              >
                {filterData.options.slice(0, 50).map(option => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
        ))}

        {/* Data Limit */}
        <Col xs={12} sm={3}>
          <div>
            <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
              Data Limit:
            </Text>
            <Select
              value={dataLimit}
              onChange={onDataLimitChange}
              style={{ width: '100%', marginTop: '2px' }}
              placeholder="All data"
              size="small"
              disabled={loading}
            >
              {dataLimitOptions.map(option => (
                <Option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </div>
        </Col>

        {/* Action Buttons */}
        <Col xs={12} sm={3}>
          <Space>
            {totalActiveFilters > 0 && (
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={handleClearAll}
                danger
                disabled={loading}
              >
                Clear All
              </Button>
            )}
            
            {performanceInfo?.isLargeDataset && (
              <Tooltip title="Large dataset detected">
                <Tag color="orange" size="small">
                  <DatabaseOutlined style={{ marginRight: '2px' }} />
                  Large
                </Tag>
              </Tooltip>
            )}
          </Space>
        </Col>
      </Row>

      {/* Performance Info Row */}
      {(performanceInfo || activeTimeFilter) && (
        <Row style={{ marginTop: '8px' }}>
          <Col span={24}>
            <Space size="small" wrap>
              {performanceInfo && (
                <Text style={{ fontSize: '11px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Total: {performanceInfo.totalRecords?.toLocaleString()} records
                </Text>
              )}
              
              {performanceInfo?.timeFilteredRecords && (
                <Text style={{ fontSize: '11px', color: '#1890ff' }}>
                  Filtered: {performanceInfo.timeFilteredRecords.toLocaleString()} records
                </Text>
              )}
              
              {performanceInfo?.displayedRecords && (
                <Text style={{ fontSize: '11px', color: '#52c41a' }}>
                  Displayed: {performanceInfo.displayedRecords.toLocaleString()} records
                </Text>
              )}
              
              {activeTimeFilter && (
                <Tag color="blue" size="small">
                  <CalendarOutlined style={{ marginRight: '2px' }} />
                  {activeTimeFilter.label}
                </Tag>
              )}
              
              {performanceInfo?.intelligentGroupingApplied && (
                <Tag color="green" size="small">
                  <ThunderboltOutlined style={{ marginRight: '2px' }} />
                  Auto-grouped
                </Tag>
              )}
            </Space>
          </Col>
        </Row>
      )}
    </Card>
  );
};

export default DashboardFilterBar;