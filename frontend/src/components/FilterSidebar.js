// frontend/src/components/FilterSidebar.js - Corrected and error-free
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Checkbox, 
  Input, 
  Typography, 
  Space, 
  Button, 
  Badge,
  Collapse,
  Empty,
  message,
  Select,
  Alert,
  Tooltip
} from 'antd';
import { 
  SearchOutlined, 
  ClearOutlined, 
  FilterOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Search } = Input;
const { Panel } = Collapse;
const { Option } = Select;

const FilterSidebar = ({ 
  filterOptions, 
  activeFilters, 
  onFilterChange, 
  isDarkMode,
  dataLimit,
  onDataLimitChange,
  performanceInfo
}) => {
  const [localFilters, setLocalFilters] = useState({});
  const [searchTerms, setSearchTerms] = useState({});

  // Data limit options
  const dataLimitOptions = [
    { label: 'Top 50 Records', value: 50 },
    { label: 'Top 100 Records', value: 100 },
    { label: 'Top 1,000 Records', value: 1000 },
    { label: 'Top 10,000 Records', value: 10000 },
    { label: 'All Data', value: null }
  ];

  // Initialize local filters from activeFilters
  useEffect(() => {
    setLocalFilters(activeFilters || {});
  }, [activeFilters]);

  // Debounced filter application
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      const filtersChanged = JSON.stringify(localFilters) !== JSON.stringify(activeFilters);
      
      if (filtersChanged && onFilterChange) {
        onFilterChange(localFilters);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [localFilters, activeFilters, onFilterChange]);

  const handleFilterChange = useCallback((filterKey, values) => {
    setLocalFilters(prevFilters => {
      const newFilters = { ...prevFilters };
      
      if (values.length === 0) {
        delete newFilters[filterKey];
      } else {
        newFilters[filterKey] = values;
      }
      
      return newFilters;
    });
  }, []);

  const handleSelectAll = useCallback((filterKey, allValues) => {
    handleFilterChange(filterKey, allValues);
  }, [handleFilterChange]);

  const handleClearFilter = useCallback((filterKey) => {
    handleFilterChange(filterKey, []);
  }, [handleFilterChange]);

  const handleClearAllFilters = useCallback(() => {
    setLocalFilters({});
    setSearchTerms({});
    if (onFilterChange) {
      onFilterChange({});
    }
    message.success('All filters cleared');
  }, [onFilterChange]);

  const handleDataLimitChange = useCallback((value) => {
    if (onDataLimitChange) {
      onDataLimitChange(value);
    }
    
    const limitLabel = dataLimitOptions.find(opt => opt.value === value)?.label || 'Custom';
    message.success(`Data limit changed to: ${limitLabel}`);
  }, [onDataLimitChange, dataLimitOptions]);

  const handleSearch = useCallback((filterKey, value) => {
    setSearchTerms(prev => ({
      ...prev,
      [filterKey]: value
    }));
  }, []);

  const getFilteredOptions = useCallback((filterKey, options) => {
    const searchTerm = searchTerms[filterKey];
    if (!searchTerm) return options;
    
    return options.filter(option => 
      option.label && option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerms]);

  const getTotalActiveFilters = useMemo(() => {
    return Object.values(localFilters).reduce((count, filterValues) => {
      return count + (Array.isArray(filterValues) ? filterValues.length : 0);
    }, 0);
  }, [localFilters]);

  const memoizedFilterOptions = useMemo(() => {
    return filterOptions || {};
  }, [filterOptions]);

  // Performance warnings
  const getPerformanceWarning = useCallback(() => {
    if (!performanceInfo) return null;
    
    const { totalRecords, isLargeDataset } = performanceInfo;
    
    if (isLargeDataset && !dataLimit) {
      return {
        type: 'warning',
        message: `Large dataset detected (${totalRecords?.toLocaleString() || 'many'} records). Consider using data limits for better performance.`
      };
    }
    
    if (totalRecords > 50000 && (!dataLimit || dataLimit > 10000)) {
      return {
        type: 'info',
        message: `For optimal performance with ${totalRecords?.toLocaleString() || 'many'} records, recommend limiting to 10,000 or fewer.`
      };
    }
    
    return null;
  }, [performanceInfo, dataLimit]);

  if (!memoizedFilterOptions || Object.keys(memoizedFilterOptions).length === 0) {
    return (
      <div style={{ 
        padding: '24px', 
        textAlign: 'center',
        background: isDarkMode ? '#1f1f1f' : '#fff',
        height: '100%'
      }}>
        <Empty 
          description={
            <Text style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>
              No filters available for this dataset
            </Text>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const performanceWarning = getPerformanceWarning();

  return (
    <div style={{ 
      background: isDarkMode ? '#1f1f1f' : '#fff',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 24px',
        borderBottom: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`,
        flexShrink: 0,
        background: isDarkMode ? '#1f1f1f' : '#fff'
      }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Badge count={getTotalActiveFilters} size="small">
              <Title level={5} style={{ margin: 0, color: isDarkMode ? '#fff' : '#000' }}>
                Real-time Filters
              </Title>
            </Badge>
            
            <Button 
              type="link" 
              size="small"
              icon={<ClearOutlined />}
              onClick={handleClearAllFilters}
              disabled={getTotalActiveFilters === 0}
              style={{ 
                color: getTotalActiveFilters > 0 ? '#ff4d4f' : (isDarkMode ? '#555' : '#999'), 
                padding: 0,
                fontWeight: getTotalActiveFilters > 0 ? 'bold' : 'normal'
              }}
            >
              Clear All
            </Button>
          </div>
          
          <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
            <ThunderboltOutlined style={{ marginRight: '4px' }} />
            Changes apply instantly • {getTotalActiveFilters} filter{getTotalActiveFilters !== 1 ? 's' : ''} active
          </Text>
        </Space>
      </div>

      {/* Data Limit Control */}
      <div style={{ 
        padding: '16px 24px',
        borderBottom: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`,
        background: isDarkMode ? '#262626' : '#fafafa'
      }}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DatabaseOutlined style={{ color: '#1890ff' }} />
            <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
              Data Display Limit
            </Text>
            <Tooltip title="Limit the number of records processed for better performance">
              <InfoCircleOutlined style={{ color: isDarkMode ? '#a0a0a0' : '#666' }} />
            </Tooltip>
          </div>
          
          <Select
            value={dataLimit}
            onChange={handleDataLimitChange}
            style={{ width: '100%' }}
            placeholder="Select data limit"
          >
            {dataLimitOptions.map(option => (
              <Option key={option.value || 'all'} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
          
          {performanceInfo && (
            <Text style={{ fontSize: '11px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
              Total: {performanceInfo.totalRecords?.toLocaleString() || 'N/A'} records
              {dataLimit && ` • Showing: ${Math.min(dataLimit, performanceInfo.totalRecords || 0).toLocaleString()}`}
            </Text>
          )}
        </Space>
      </div>

      {/* Performance Warning */}
      {performanceWarning && (
        <div style={{ padding: '16px 24px' }}>
          <Alert
            message={performanceWarning.message}
            type={performanceWarning.type}
            showIcon
            size="small"
            style={{ fontSize: '12px' }}
          />
        </div>
      )}

      {/* Filter Panels */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        padding: '16px 0'
      }}>
        <Collapse 
          defaultActiveKey={Object.keys(memoizedFilterOptions)}
          ghost
          expandIconPosition="right"
          size="small"
        >
          {Object.entries(memoizedFilterOptions).map(([filterKey, filterData]) => {
            if (!filterData || !filterData.options || !Array.isArray(filterData.options)) {
              return null;
            }

            const { label, options, isSampled } = filterData;
            const filteredOptions = getFilteredOptions(filterKey, options);
            const selectedValues = localFilters[filterKey] || [];
            const allValues = options.map(opt => opt.value).filter(val => val !== null && val !== undefined);

            return (
              <Panel 
                header={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
                        {label}
                      </Text>
                      {isSampled && (
                        <Tooltip title="Filter options are sampled from large dataset">
                          <InfoCircleOutlined 
                            style={{ 
                              color: '#fa8c16', 
                              fontSize: '12px'
                            }} 
                          />
                        </Tooltip>
                      )}
                    </div>
                    {selectedValues.length > 0 && (
                      <Badge 
                        count={selectedValues.length} 
                        size="small"
                        style={{ marginRight: '8px' }}
                      />
                    )}
                  </div>
                }
                key={filterKey}
                style={{
                  background: isDarkMode ? '#262626' : '#fafafa',
                  marginBottom: '8px',
                  border: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`,
                  borderRadius: '6px'
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {/* Search */}
                  {options.length > 5 && (
                    <Search
                      placeholder={`Search ${label.toLowerCase()}...`}
                      size="small"
                      prefix={<SearchOutlined />}
                      onChange={(e) => handleSearch(filterKey, e.target.value)}
                      value={searchTerms[filterKey] || ''}
                      style={{ marginBottom: '8px' }}
                      allowClear
                    />
                  )}

                  {/* Select/Clear All with counts */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Button 
                      type="link" 
                      size="small"
                      onClick={() => handleSelectAll(filterKey, allValues)}
                      disabled={selectedValues.length === allValues.length}
                      style={{ 
                        padding: 0, 
                        height: 'auto',
                        color: selectedValues.length === allValues.length ? '#999' : '#1890ff'
                      }}
                    >
                      Select All ({allValues.length})
                    </Button>
                    
                    <Button 
                      type="link" 
                      size="small"
                      onClick={() => handleClearFilter(filterKey)}
                      disabled={selectedValues.length === 0}
                      style={{ 
                        padding: 0, 
                        height: 'auto',
                        color: selectedValues.length === 0 ? '#999' : '#ff4d4f'
                      }}
                    >
                      Clear ({selectedValues.length})
                    </Button>
                  </div>

                  {/* Large dataset warning for high cardinality */}
                  {options.length > 50 && (
                    <Alert
                      message={`${options.length} unique values detected. Consider using search to narrow options.`}
                      type="info"
                      size="small"
                      showIcon
                      style={{ fontSize: '11px', marginBottom: '8px' }}
                    />
                  )}

                  {/* Options */}
                  <Checkbox.Group
                    value={selectedValues}
                    onChange={(values) => handleFilterChange(filterKey, values)}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      {filteredOptions.length > 0 ? (
                        filteredOptions.slice(0, 100).map((option) => {
                          if (!option || option.value === null || option.value === undefined) {
                            return null;
                          }
                          
                          return (
                            <Checkbox 
                              key={String(option.value)} 
                              value={option.value}
                              style={{ 
                                width: '100%',
                                color: isDarkMode ? '#fff' : '#000'
                              }}
                            >
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                width: 'calc(100% - 20px)'
                              }}>
                                <Text 
                                  style={{ 
                                    color: isDarkMode ? '#fff' : '#000',
                                    fontSize: '13px'
                                  }}
                                  ellipsis={{ tooltip: option.label }}
                                >
                                  {option.label || String(option.value)}
                                </Text>
                              </div>
                            </Checkbox>
                          );
                        }).filter(Boolean)
                      ) : (
                        <Text 
                          style={{ 
                            color: isDarkMode ? '#a0a0a0' : '#666',
                            fontSize: '12px',
                            fontStyle: 'italic',
                            textAlign: 'center',
                            display: 'block',
                            padding: '8px'
                          }}
                        >
                          No options match your search
                        </Text>
                      )}
                      
                      {filteredOptions.length > 100 && (
                        <Text 
                          style={{ 
                            color: isDarkMode ? '#a0a0a0' : '#666',
                            fontSize: '11px',
                            textAlign: 'center',
                            display: 'block',
                            padding: '8px',
                            fontStyle: 'italic'
                          }}
                        >
                          Showing first 100 options. Use search to find more.
                        </Text>
                      )}
                    </Space>
                  </Checkbox.Group>
                </Space>
              </Panel>
            );
          }).filter(Boolean)}
        </Collapse>
      </div>

      {/* Footer with Performance Info */}
      <div style={{ 
        padding: '16px 24px',
        borderTop: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`,
        background: isDarkMode ? '#262626' : '#fafafa',
        flexShrink: 0
      }}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
              <FilterOutlined style={{ marginRight: '4px' }} />
              {getTotalActiveFilters} filter{getTotalActiveFilters !== 1 ? 's' : ''} applied
            </Text>
            
            {getTotalActiveFilters > 0 && (
              <Button 
                size="small"
                type="primary"
                danger
                onClick={handleClearAllFilters}
                style={{ fontSize: '11px' }}
              >
                Reset All
              </Button>
            )}
          </div>
          
          {performanceInfo && (
            <div style={{ 
              fontSize: '11px', 
              color: isDarkMode ? '#a0a0a0' : '#666',
              borderTop: `1px solid ${isDarkMode} ? "#434343" : "#e8e8e8"}`,
              paddingTop: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total Records:</span>
                <span>{performanceInfo.totalRecords?.toLocaleString() || 'N/A'}</span>
              </div>
              {dataLimit && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Display Limit:</span>
                  <span>{dataLimit.toLocaleString()}</span>
                </div>
              )}
              {performanceInfo.filteredRecords !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>After Filters:</span>
                  <span>{performanceInfo.filteredRecords?.toLocaleString() || 'N/A'}</span>
                </div>
              )}
              {performanceInfo.isLargeDataset && (
                <div style={{ 
                  marginTop: '4px', 
                  padding: '4px', 
                  background: isDarkMode ? '#1f1f1f' : '#fff',
                  borderRadius: '3px',
                  textAlign: 'center',
                  color: '#fa8c16'
                }}>
                  <DatabaseOutlined style={{ marginRight: '4px' }} />
                  Large Dataset Mode
                </div>
              )}
            </div>
          )}
        </Space>
      </div>
    </div>
  );
};

export default FilterSidebar;