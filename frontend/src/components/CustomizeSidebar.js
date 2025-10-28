// frontend/src/components/CustomizeSidebar.js
import React, { useState, useCallback, useEffect } from 'react';
import { 
  Card, 
  Checkbox, 
  Button, 
  Typography, 
  Space, 
  Divider,
  Select,
  Spin,
  Alert,
  Tag,
  Row,
  Col,
  message,
  Collapse,
  Badge
} from 'antd';
import { 
  ExperimentOutlined,
  RocketOutlined,
  EditOutlined,
  CheckOutlined,
  ReloadOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
  DotChartOutlined,
  BulbOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { getCustomChartCombinations } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

const CustomizeSidebar = ({ 
  sessionId, 
  schema, 
  onChartConfirm, 
  isDarkMode,
  activeFilters 
}) => {
  const [selectedMeasures, setSelectedMeasures] = useState([]);
  const [selectedDimensions, setSelectedDimensions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [combinations, setCombinations] = useState([]);
  const [error, setError] = useState(null);
  const [editingCombination, setEditingCombination] = useState(null);

  // Chart type options with icons
  const chartTypes = [
    { value: 'bar', label: 'Bar Chart', icon: <BarChartOutlined /> },
    { value: 'line', label: 'Line Chart', icon: <LineChartOutlined /> },
    { value: 'pie', label: 'Pie Chart', icon: <PieChartOutlined /> },
    { value: 'area', label: 'Area Chart', icon: <AreaChartOutlined /> },
    { value: 'scatter', label: 'Scatter Plot', icon: <DotChartOutlined /> }
  ];

  const getChartIcon = (type) => {
    const chart = chartTypes.find(c => c.value === type);
    return chart?.icon || <BarChartOutlined />;
  };

  const getChartLabel = (type) => {
    const chart = chartTypes.find(c => c.value === type);
    return chart?.label || 'Bar Chart';
  };

  const handleMeasureChange = useCallback((checkedValues) => {
    console.log('📊 Selected measures:', checkedValues);
    setSelectedMeasures(checkedValues);
  }, []);

  const handleDimensionChange = useCallback((checkedValues) => {
    console.log('📋 Selected dimensions:', checkedValues);
    setSelectedDimensions(checkedValues);
  }, []);

  const handleGetCombinations = async () => {
    if (selectedMeasures.length === 0 || selectedDimensions.length === 0) {
      message.warning('Please select at least one measure and one dimension');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setCombinations([]);

      console.log('🚀 Getting AI chart combinations for:', {
        measures: selectedMeasures,
        dimensions: selectedDimensions,
        schema: schema
      });

      const result = await getCustomChartCombinations(
        sessionId,
        selectedMeasures,
        selectedDimensions,
        activeFilters
      );

      console.log('✅ AI combinations received:', result);

      if (result.success && result.combinations) {
        setCombinations(result.combinations);
        message.success(`Generated ${result.combinations.length} chart combinations!`);
      } else {
        throw new Error(result.message || 'Failed to generate combinations');
      }

    } catch (error) {
      console.error('❌ Combinations error:', error);
      setError(error.message);
      message.error('Failed to generate combinations: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCombination = (index) => {
    setEditingCombination(index);
  };

  const handleSaveEdit = (index, newCombination) => {
    const updatedCombinations = [...combinations];
    updatedCombinations[index] = newCombination;
    setCombinations(updatedCombinations);
    setEditingCombination(null);
    message.success('Combination updated successfully!');
  };

  const handleConfirmCombination = async (combination) => {
    try {
      console.log('✅ Confirming chart combination:', combination);
      await onChartConfirm(combination);
      message.success('Chart added to dashboard successfully!');
    } catch (error) {
      console.error('❌ Confirm error:', error);
      message.error('Failed to add chart to dashboard');
    }
  };

  const CombinationCard = ({ combination, index }) => {
    const isEditing = editingCombination === index;
    const [editedCombination, setEditedCombination] = useState(combination);

    useEffect(() => {
      setEditedCombination(combination);
    }, [combination]);

    if (isEditing) {
      return (
        <Card
          size="small"
          style={{
            marginBottom: '12px',
            background: isDarkMode ? '#262626' : '#f9f9f9',
            borderColor: isDarkMode ? '#434343' : '#d9d9d9',
            borderLeft: `4px solid #fa8c16`
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
              ✏️ Editing Combination {index + 1}
            </Text>

            <div>
              <Text style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>Chart Type:</Text>
              <Select
                value={editedCombination.type}
                style={{ width: '100%', marginTop: '4px' }}
                onChange={(value) => setEditedCombination(prev => ({ ...prev, type: value }))}
              >
                {chartTypes.map(type => (
                  <Option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </Option>
                ))}
              </Select>
            </div>

            <div>
              <Text style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>Measures:</Text>
              <Select
                mode="multiple"
                value={editedCombination.measures}
                style={{ width: '100%', marginTop: '4px' }}
                onChange={(value) => setEditedCombination(prev => ({ ...prev, measures: value }))}
              >
                {schema.measures.map(measure => (
                  <Option key={measure.name} value={measure.name}>
                    {measure.name}
                  </Option>
                ))}
              </Select>
            </div>

            <div>
              <Text style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>Dimensions:</Text>
              <Select
                mode="multiple"
                value={editedCombination.dimensions}
                style={{ width: '100%', marginTop: '4px' }}
                onChange={(value) => setEditedCombination(prev => ({ ...prev, dimensions: value }))}
              >
                {schema.dimensions.map(dimension => (
                  <Option key={dimension.name} value={dimension.name}>
                    {dimension.name}
                  </Option>
                ))}
              </Select>
            </div>

            <Row gutter={8}>
              <Col span={12}>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleSaveEdit(index, editedCombination)}
                  block
                >
                  Save
                </Button>
              </Col>
              <Col span={12}>
                <Button
                  size="small"
                  onClick={() => setEditingCombination(null)}
                  block
                >
                  Cancel
                </Button>
              </Col>
            </Row>
          </Space>
        </Card>
      );
    }

    return (
      <Card
        size="small"
        hoverable
        style={{
          marginBottom: '12px',
          background: isDarkMode ? '#1f1f1f' : '#fff',
          borderColor: isDarkMode ? '#434343' : '#f0f0f0',
          borderLeft: `4px solid ${combination.isAiGenerated ? '#52c41a' : '#1890ff'}`
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getChartIcon(combination.type)}
              <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
                {combination.title || `${getChartLabel(combination.type)} ${index + 1}`}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {combination.isAiGenerated && (
                <Tag color="green" size="small">
                  <BulbOutlined style={{ marginRight: '2px' }} />
                  AI
                </Tag>
              )}
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEditCombination(index)}
                style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}
              />
            </div>
          </div>

          <div>
            <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
              📊 Measures: {combination.measures.join(', ')}
            </Text>
            <br />
            <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
              📋 Dimensions: {combination.dimensions.join(', ')}
            </Text>
          </div>

          {combination.aiSuggestion && (
            <div style={{
              padding: '8px',
              background: isDarkMode ? '#001529' : '#f6ffed',
              borderRadius: '4px',
              border: `1px solid ${isDarkMode ? '#0958d9' : '#b7eb8f'}`
            }}>
              <Text style={{ fontSize: '11px', color: isDarkMode ? '#91caff' : '#389e0d' }}>
                💡 AI Insight: {combination.aiSuggestion}
              </Text>
            </div>
          )}

          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleConfirmCombination(combination)}
            block
          >
            Add to Dashboard
          </Button>
        </Space>
      </Card>
    );
  };

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
        background: isDarkMode ? '#262626' : '#fafafa'
      }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ExperimentOutlined style={{ color: '#1890ff', fontSize: '18px' }} />
            <Title level={5} style={{ margin: 0, color: isDarkMode ? '#fff' : '#000' }}>
              Customize Dashboard
            </Title>
          </div>
          <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
            Select measures and dimensions to generate AI-powered chart combinations
          </Text>
        </Space>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Data Selection */}
          <Collapse defaultActiveKey={['1']} ghost>
            <Panel
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SettingOutlined />
                  <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
                    Select Data Fields
                  </Text>
                  <Badge 
                    count={selectedMeasures.length + selectedDimensions.length} 
                    size="small"
                  />
                </div>
              }
              key="1"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* Measures Selection */}
                <Card
                  title={
                    <span style={{ color: isDarkMode ? '#fff' : '#000' }}>
                      📊 Measures ({schema.measures.length})
                    </span>
                  }
                  size="small"
                  style={{
                    background: isDarkMode ? '#262626' : '#f9f9f9',
                    borderColor: isDarkMode ? '#434343' : '#d9d9d9'
                  }}
                >
                  <Checkbox.Group
                    value={selectedMeasures}
                    onChange={handleMeasureChange}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {schema.measures.map((measure) => (
                        <Checkbox
                          key={measure.name}
                          value={measure.name}
                          style={{ color: isDarkMode ? '#fff' : '#000' }}
                        >
                          <div>
                            <Text style={{ color: isDarkMode ? '#fff' : '#000' }}>
                              {measure.name}
                            </Text>
                            <br />
                            <Text style={{ fontSize: '11px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                              Type: {measure.type} • Values: {measure.uniqueValues}
                            </Text>
                          </div>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </Card>

                {/* Dimensions Selection */}
                <Card
                  title={
                    <span style={{ color: isDarkMode ? '#fff' : '#000' }}>
                      📋 Dimensions ({schema.dimensions.length})
                    </span>
                  }
                  size="small"
                  style={{
                    background: isDarkMode ? '#262626' : '#f9f9f9',
                    borderColor: isDarkMode ? '#434343' : '#d9d9d9'
                  }}
                >
                  <Checkbox.Group
                    value={selectedDimensions}
                    onChange={handleDimensionChange}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {schema.dimensions.map((dimension) => (
                        <Checkbox
                          key={dimension.name}
                          value={dimension.name}
                          style={{ color: isDarkMode ? '#fff' : '#000' }}
                        >
                          <div>
                            <Text style={{ color: isDarkMode ? '#fff' : '#000' }}>
                              {dimension.name}
                            </Text>
                            <br />
                            <Text style={{ fontSize: '11px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                              Type: {dimension.type} • Values: {dimension.uniqueValues}
                            </Text>
                          </div>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </Card>

                {/* Generate Combinations Button */}
                <Button
                  type="primary"
                  size="large"
                  icon={loading ? <Spin size="small" /> : <RocketOutlined />}
                  onClick={handleGetCombinations}
                  disabled={selectedMeasures.length === 0 || selectedDimensions.length === 0 || loading}
                  block
                  style={{ marginTop: '16px' }}
                >
                  {loading ? 'Generating AI Combinations...' : 'Get AI Chart Combinations'}
                </Button>
              </Space>
            </Panel>
          </Collapse>

          <Divider style={{ borderColor: isDarkMode ? '#434343' : '#f0f0f0' }} />

          {/* Error Display */}
          {error && (
            <Alert
              message="AI Analysis Error"
              description={error}
              type="error"
              showIcon
              action={
                <Button size="small" onClick={handleGetCombinations}>
                  <ReloadOutlined /> Retry
                </Button>
              }
            />
          )}

          {/* Chart Combinations */}
          {combinations.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <BulbOutlined style={{ color: '#52c41a' }} />
                <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>
                  AI Chart Combinations ({combinations.length})
                </Text>
              </div>
              
              {combinations.map((combination, index) => (
                <CombinationCard
                  key={index}
                  combination={combination}
                  index={index}
                />
              ))}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <Card style={{
              textAlign: 'center',
              background: isDarkMode ? '#262626' : '#f9f9f9',
              borderColor: isDarkMode ? '#434343' : '#d9d9d9'
            }}>
              <Space direction="vertical">
                <Spin size="large" />
                <Text style={{ color: isDarkMode ? '#fff' : '#000' }}>
                  AI is analyzing your data selection...
                </Text>
                <Text style={{ fontSize: '12px', color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Generating intelligent chart combinations
                </Text>
              </Space>
            </Card>
          )}
        </Space>
      </div>
    </div>
  );
};

export default CustomizeSidebar;