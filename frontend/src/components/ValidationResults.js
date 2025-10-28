// frontend/src/components/ValidationResults.js
import React from 'react';
import { Card, Alert, Collapse, Tag, Typography, Space, Button, Divider } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  BugOutlined,
  DatabaseOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  FileSearchOutlined
} from '@ant-design/icons';

const { Panel } = Collapse;
const { Text, Paragraph, Title } = Typography;

const ValidationResults = ({ 
  validationResult, 
  onProceed, 
  onReupload, 
  isDarkMode 
}) => {
  if (!validationResult) return null;

  const { 
    overallStatus, 
    isReadyForDashboard, 
    validationResults, 
    summary, 
    overallAssessment,
    confidence 
  } = validationResult;

  // Status configuration
  const statusConfig = {
    valid: {
      color: 'success',
      icon: <CheckCircleOutlined />,
      title: 'Data Validation Passed',
      description: 'Your data is clean and ready for dashboard generation'
    },
    warning: {
      color: 'warning',
      icon: <WarningOutlined />,
      title: 'Data Validation - Minor Issues',
      description: 'Some warnings detected but you can proceed with caution'
    },
    error: {
      color: 'error',
      icon: <CloseCircleOutlined />,
      title: 'Data Validation Failed',
      description: 'Critical issues found. Please fix your data before proceeding'
    }
  };

  const currentStatus = statusConfig[overallStatus];

  // Category icons
  const categoryIcons = {
    schema: <DatabaseOutlined />,
    datatype: <BugOutlined />,
    quality: <FileSearchOutlined />,
    business: <ThunderboltOutlined />,
    integrity: <SafetyOutlined />
  };

  // Group issues by category
  const groupedIssues = validationResults.reduce((acc, issue) => {
    if (!acc[issue.category]) {
      acc[issue.category] = [];
    }
    acc[issue.category].push(issue);
    return acc;
  }, {});

  return (
    <Card
      style={{
        marginTop: '24px',
        borderColor: currentStatus.color === 'error' ? '#ff4d4f' : 
                     currentStatus.color === 'warning' ? '#faad14' : '#52c41a',
        borderWidth: '2px'
      }}
    >
      {/* Header Alert */}
      <Alert
        message={currentStatus.title}
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>{currentStatus.description}</Text>
            <Text type="secondary">{overallAssessment}</Text>
            {confidence && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                AI Confidence: {(confidence * 100).toFixed(0)}%
              </Text>
            )}
          </Space>
        }
        type={currentStatus.color}
        icon={currentStatus.icon}
        showIcon
        style={{ marginBottom: '16px' }}
      />

      {/* Summary Stats */}
      <Space size="large" style={{ marginBottom: '16px' }}>
        <div>
          <Text type="secondary">Total Issues:</Text>
          <Title level={4} style={{ margin: 0 }}>{summary.totalIssues}</Title>
        </div>
        <Divider type="vertical" style={{ height: '40px' }} />
        <div>
          <Text type="danger">Errors:</Text>
          <Title level={4} style={{ margin: 0, color: '#ff4d4f' }}>{summary.errors}</Title>
        </div>
        <div>
          <Text type="warning">Warnings:</Text>
          <Title level={4} style={{ margin: 0, color: '#faad14' }}>{summary.warnings}</Title>
        </div>
        <div>
          <Text type="secondary">Info:</Text>
          <Title level={4} style={{ margin: 0, color: '#1890ff' }}>{summary.info}</Title>
        </div>
      </Space>

      {/* Detailed Issues */}
      {validationResults.length > 0 && (
        <Collapse 
          ghost 
          defaultActiveKey={summary.errors > 0 ? Object.keys(groupedIssues) : []}
        >
          {Object.entries(groupedIssues).map(([category, issues]) => (
            <Panel
              key={category}
              header={
                <Space>
                  {categoryIcons[category]}
                  <Text strong>{category.charAt(0).toUpperCase() + category.slice(1)} Issues</Text>
                  <Tag color={
                    issues.some(i => i.severity === 'error') ? 'error' :
                    issues.some(i => i.severity === 'warning') ? 'warning' : 'default'
                  }>
                    {issues.length}
                  </Tag>
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {issues.map((issue, idx) => (
                  <Card 
                    key={idx}
                    size="small"
                    style={{
                      borderLeft: `4px solid ${
                        issue.severity === 'error' ? '#ff4d4f' :
                        issue.severity === 'warning' ? '#faad14' : '#1890ff'
                      }`
                    }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space>
                        {issue.severity === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                        {issue.severity === 'warning' && <WarningOutlined style={{ color: '#faad14' }} />}
                        {issue.severity === 'info' && <InfoCircleOutlined style={{ color: '#1890ff' }} />}
                        <Text strong>{issue.issue}</Text>
                      </Space>

                      {issue.affectedColumns.length > 0 && (
                        <div>
                          <Text type="secondary" style={{ fontSize: '12px' }}>Affected Columns: </Text>
                          {issue.affectedColumns.map(col => (
                            <Tag key={col} color="blue" style={{ fontSize: '11px' }}>{col}</Tag>
                          ))}
                        </div>
                      )}

                      <Paragraph style={{ marginBottom: 0, fontSize: '13px' }}>
                        <Text type="secondary">💡 Recommendation: </Text>
                        <Text>{issue.recommendation}</Text>
                      </Paragraph>

                      {issue.examples && issue.examples.length > 0 && (
                        <div style={{ 
                          background: isDarkMode ? '#1f1f1f' : '#f5f5f5',
                          padding: '8px',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          <Text type="secondary">Examples:</Text>
                          {issue.examples.map((ex, i) => (
                            <div key={i}><Text code>{ex}</Text></div>
                          ))}
                        </div>
                      )}
                    </Space>
                  </Card>
                ))}
              </Space>
            </Panel>
          ))}
        </Collapse>
      )}

      {/* Action Buttons */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <Space size="large">
          <Button
            type="primary"
            size="large"
            onClick={onProceed}
            disabled={!isReadyForDashboard}
            icon={<CheckCircleOutlined />}
          >
            Proceed to Dashboard
          </Button>

          <Button
            size="large"
            onClick={onReupload}
            danger={!isReadyForDashboard}
          >
            {isReadyForDashboard ? 'Upload Different File' : 'Fix & Re-upload'}
          </Button>
        </Space>

        {!isReadyForDashboard && (
          <Paragraph type="danger" style={{ marginTop: '16px', marginBottom: 0 }}>
            ⚠️ Please fix the errors above and re-upload your file
          </Paragraph>
        )}
      </div>
    </Card>
  );
};

export default ValidationResults;