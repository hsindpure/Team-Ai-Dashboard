import React, { useState, useRef } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter
} from 'recharts';

import { 
  ArrowLeftOutlined, 
  FilterOutlined, 
  DownloadOutlined,
  ReloadOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  BarChartOutlined,
  FileAddOutlined,
  InfoCircleOutlined,
  CalculatorOutlined,
  DatabaseOutlined,
  FunctionOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  ClearOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined
} from '@ant-design/icons';


import { Empty, Button, Modal, Dropdown, message, Popover, Spin, Alert, Typography } from 'antd';
import html2canvas from 'html2canvas';
import { getChartInsights } from '../services/api';


const { Title, Text } = Typography;

const ChartContainer = ({ chart, sessionId, activeFilters, dataLimit, isDarkMode, height = 300, updating = false }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef(null);

  const [chartInsights, setChartInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  if (!chart || !chart.data || chart.data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty 
          description="No data available"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}
        />
      </div>
    );
  }

  const { type, data, config } = chart;
  
  // Color palette for charts
  const colors = ['#1890ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#eb2f96', '#13c2c2', '#a0d911'];
  
  // Theme-aware colors
  const axisColor = isDarkMode ? '#a0a0a0' : '#666';
  const gridColor = isDarkMode ? '#434343' : '#f0f0f0';
  const tooltipBg = isDarkMode ? '#262626' : '#fff';
  const tooltipBorder = isDarkMode ? '#434343' : '#d9d9d9';


  // Add this function after existing functions
  const loadChartInsights = async () => {
    if (!sessionId || insightsLoading || chartInsights) return;
    
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      
      const result = await getChartInsights(
        sessionId,
        {
          id: chart.id,
          title: chart.title,
          type: chart.type,
          measures: chart.measures,
          dimensions: chart.dimensions,
          data: chart.data
        },
        activeFilters || {},
        dataLimit
      );
      
      setChartInsights(result.insights);
      
    } catch (error) {
      console.error('Failed to load chart insights:', error);
      setInsightsError(error.message);
    } finally {
      setInsightsLoading(false);
    }
  };



  // Export functionality
  const exportChart = async (format = 'png') => {
    if (!chartRef.current || exporting) {
      return;
    }
  
    try {
      setExporting(true);
      
      // Wait for any ongoing animations to finish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Direct capture without cloning
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: isDarkMode ? '#1f1f1f' : '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        ignoreElements: (element) => {
          // Ignore buttons and overlays during capture
          return element.classList.contains('ant-btn') || 
                 element.style.position === 'absolute';
        }
      });
  
      canvas.toBlob((blob) => {
        if (!blob) {
          message.error('Failed to generate chart image');
          return;
        }
  
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = `${chart.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'chart'}_${new Date().getTime()}.${format}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success(`Chart exported as ${format.toUpperCase()}`);
      }, `image/${format}`, format === 'jpeg' ? 0.9 : 1);
  
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export chart. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportMenuItems = [
    {
      key: 'png',
      label: 'Export as PNG',
      onClick: () => exportChart('png')
    },
    {
      key: 'jpeg',
      label: 'Export as JPG',
      onClick: () => exportChart('jpeg')
    }
  ];

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: tooltipBg,
          border: `1px solid ${tooltipBorder}`,
          borderRadius: '6px',
          padding: '12px',
          boxShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.12)'
        }}>
          <p style={{ 
            color: isDarkMode ? '#fff' : '#000', 
            margin: '0 0 8px 0',
            fontWeight: 'bold'
          }}>
            {label}
          </p>
          {payload.map((entry, index) => (
            <p key={index} style={{ 
              color: entry.color, 
              margin: '4px 0',
              fontSize: '14px'
            }}>
              {`${entry.name}: ${typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Common props for all charts with animation
  const commonProps = {
    data,
    margin: isFullscreen 
      ? { top: 40, right: 40, left: 40, bottom: 40 }
      : (config?.margin || { top: 20, right: 30, left: 20, bottom: 5 })
  };

  // Animation config for smooth updates
  const animationConfig = {
    animationBegin: 0,
  animationDuration: exporting ? 0 : (updating ? 300 : 800),
  animationEasing: 'ease-in-out'
  };

  const renderChart = () => {
    switch (type.toLowerCase()) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis 
              dataKey={config?.xAxisKey} 
              tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }}
              angle={data.length > 5 ? -45 : 0}
              textAnchor={data.length > 5 ? 'end' : 'middle'}
              height={data.length > 5 ? (isFullscreen ? 100 : 80) : (isFullscreen ? 80 : 60)}
            />
            <YAxis tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {chart.measures?.map((measure, index) => (
              <Bar 
                key={measure}
                dataKey={measure} 
                fill={colors[index % colors.length]}
                name={measure.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                radius={[4, 4, 0, 0]}
                {...animationConfig}
                style={{
                  filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis 
              dataKey={config?.xAxisKey} 
              tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }}
            />
            <YAxis tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {chart.measures?.map((measure, index) => (
              <Line 
                key={measure}
                type="monotone"
                dataKey={measure} 
                stroke={colors[index % colors.length]}
                strokeWidth={isFullscreen ? 4 : 3}
                dot={{ 
                  fill: colors[index % colors.length], 
                  strokeWidth: 2, 
                  r: isFullscreen ? 6 : 4,
                  style: {
                    filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                    transition: 'all 0.3s ease'
                  }
                }}
                name={measure.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                {...animationConfig}
                style={{
                  filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis 
              dataKey={config?.xAxisKey} 
              tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }}
            />
            <YAxis tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {chart.measures?.map((measure, index) => (
              <Area 
                key={measure}
                type="monotone"
                dataKey={measure} 
                stackId="1"
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={updating ? 0.4 : 0.6}
                name={measure.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                {...animationConfig}
                style={{
                  filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </AreaChart>
        );

      case 'pie':
        const RADIAN = Math.PI / 180;
        const renderCustomizedLabel = ({
          cx, cy, midAngle, innerRadius, outerRadius, percent
        }) => {
          if (percent < 0.05) return null; // Don't show labels for slices < 5%
          
          const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
          const x = cx + radius * Math.cos(-midAngle * RADIAN);
          const y = cy + radius * Math.sin(-midAngle * RADIAN);

          return (
            <text 
              x={x} 
              y={y} 
              fill={isDarkMode ? '#fff' : '#000'}
              textAnchor={x > cx ? 'start' : 'end'} 
              dominantBaseline="central"
              fontSize={isFullscreen ? 14 : 12}
              fontWeight="bold"
              style={{
                filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                transition: 'all 0.3s ease'
              }}
            >
              {`${(percent * 100).toFixed(0)}%`}
            </text>
          );
        };

        return (
          <PieChart {...commonProps}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={isFullscreen ? Math.min(height * 0.4, 200) : Math.min(height * 0.35, 120)}
              fill="#8884d8"
              dataKey={config?.dataKey}
              nameKey={config?.nameKey}
              {...animationConfig}
              style={{
                filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                transition: 'all 0.3s ease'
              }}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={colors[index % colors.length]}
                  style={{
                    filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        );

      case 'scatter':
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis 
              dataKey={config?.xAxisKey} 
              tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }}
              type="number"
            />
            <YAxis 
              dataKey={config?.dataKey} 
              tick={{ fill: axisColor, fontSize: isFullscreen ? 14 : 12 }}
              type="number"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Scatter 
              data={data} 
              fill={colors[0]}
              name={config?.dataKey?.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              {...animationConfig}
              style={{
                filter: updating ? 'opacity(0.7)' : 'opacity(1)',
                transition: 'all 0.3s ease'
              }}
            />
          </ScatterChart>
        );

      default:
        return (
          <div style={{ 
            height: isFullscreen ? '60vh' : height, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: isDarkMode ? '#a0a0a0' : '#666'
          }}>
            <Empty 
              description={`Chart type "${type}" not supported`}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        );
    }
  };

  const handleFullscreenToggle = () => {
    setIsFullscreen(!isFullscreen);
  };

  const ChartContent = () => (
<div 

   ref={chartRef}
  data-chart-id={chart.id}

  style={{ 
    width: '100%', 
    height: isFullscreen ? '70vh' : height,
    position: 'relative',
    transition: 'all 0.3s ease',
    transform: updating ? 'scale(0.98)' : 'scale(1)',
    filter: updating ? 'blur(0.5px)' : 'blur(0px)',
    padding: '16px',
    background: isDarkMode ? '#1f1f1f' : '#ffffff',
    borderRadius: '6px'
  }}
>
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
      
      {/* Action buttons - Only show in normal view */}

  {/* Hidden trigger buttons for header controls */}
        {!isFullscreen && (
          <>
            {/* Hidden Chart Info Button */}
          

            {/* Hidden Fullscreen Button */}
            <button
              className="chart-fullscreen-button"
              onClick={handleFullscreenToggle}
              style={{ display: 'none' }}
            />

            {/* Hidden Export Button */}
            <button
              className="chart-export-button"
              onClick={(e) => {
                e.preventDefault();
                exportChart('png');
              }}
              style={{ display: 'none' }}
            />
          </>
        )}

      
      {/* Updating indicator */}
      {updating && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '80px',
          background: 'rgba(24, 144, 255, 0.1)',
          border: '1px solid rgba(24, 144, 255, 0.3)',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '10px',
          color: '#1890ff',
          fontWeight: 'bold',
          zIndex: 10
        }}>
          Updating...
        </div>
      )}

      {/* Exporting indicator */}
      {exporting && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '120px',
          background: 'rgba(82, 196, 26, 0.1)',
          border: '1px solid rgba(82, 196, 26, 0.3)',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '10px',
          color: '#52c41a',
          fontWeight: 'bold',
          zIndex: 10
        }}>
          Exporting...
        </div>
      )}
    </div>
  );

  // Regular chart view
  if (!isFullscreen) {
    return <ChartContent />;
  }

  // Fullscreen modal view
  return (
    <>
      <ChartContent />
      <Modal
        title={
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            color: isDarkMode ? '#fff' : '#000'
          }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {chart.title}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Export in fullscreen */}
              <Dropdown
                menu={{ items: exportMenuItems }}
                trigger={['click']}
                disabled={exporting}
              >
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  style={{ color: isDarkMode ? '#fff' : '#000' }}
                  title="Export chart"
                />
              </Dropdown>
              
              {/* Exit fullscreen */}
              <Button
                type="text"
                icon={<FullscreenExitOutlined />}
                onClick={handleFullscreenToggle}
                style={{ color: isDarkMode ? '#fff' : '#000' }}
                title="Exit fullscreen"
              />
            </div>
          </div>
        }
        open={isFullscreen}
        onCancel={handleFullscreenToggle}
        footer={null}
        width="95vw"
        style={{ 
          top: 20,
          maxWidth: 'none'
        }}
        bodyStyle={{
          padding: '24px',
          background: isDarkMode ? '#1f1f1f' : '#fff',
          minHeight: '75vh'
        }}
        modalRender={(modal) => (
          <div style={{
            background: isDarkMode ? '#1f1f1f' : '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}>
            {modal}
          </div>
        )}
      >
        <div style={{ 
          height: '70vh',
          width: '100%'
        }}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
        
        {/* Fullscreen chart info */}
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: isDarkMode ? '#262626' : '#f9f9f9',
          borderRadius: '6px',
          borderLeft: `4px solid ${colors[0]}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ 
                color: isDarkMode ? '#fff' : '#000',
                fontWeight: 'bold',
                marginRight: '16px'
              }}>
                Chart Type: {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
              <span style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>
                Data Points: {data.length}
              </span>
            </div>
            <div style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>
              Measures: {chart.measures?.join(', ')} | Dimensions: {chart.dimensions?.join(', ')}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ChartContainer;
