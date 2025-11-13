// frontend/src/components/ValidationResults.js
import React from 'react';
import { Card, Alert, Collapse, Tag, Typography, Space, Button, Divider, Progress, Row, Col, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  BugOutlined,
  DatabaseOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
  RocketOutlined,
  BulbOutlined,
  StarOutlined,
  BarChartOutlined
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
    validationResults = [],
    summary = {},
    overallAssessment,
    confidence,
    dataQualityScore,
    scoreCategory,
    visualizationReadiness,
    strengths = [],
    insights = [],
    businessDomain = '',
    businessQuestions = [],
    visualizationRecommendations = [],
    performanceWarnings = []
  } = validationResult;

  // Get score color
  const getScoreColor = (score) => {
    if (score >= 90) return '#52c41a';
    if (score >= 70) return '#1890ff';
    if (score >= 50) return '#faad14';
    return '#ff4d4f';
  };

  // Status configuration - updated for new severity levels
  const statusConfig = {
    valid: {
      color: 'success',
      icon: <CheckCircleOutlined />,
      title: 'Excellent Data Quality',
      description: 'Your data is clean and ready for dashboard generation'
    },
    warning: {
      color: 'warning',
      icon: <WarningOutlined />,
      title: 'Good Data Quality - Minor Issues',
      description: 'Some warnings detected but you can proceed with dashboard creation'
    },
    critical: {
      color: 'error',
      icon: <CloseCircleOutlined />,
      title: 'Data Quality Issues Detected',
      description: 'Critical issues found that may affect dashboard quality'
    },
    error: {
      color: 'error',
      icon: <CloseCircleOutlined />,
      title: 'Data Quality Issues Detected',
      description: 'Critical issues found that may affect dashboard quality'
    }
  };

  const currentStatus = statusConfig[overallStatus] || statusConfig.warning;

  // Category icons
  const categoryIcons = {
    schema: <DatabaseOutlined />,
    datatype: <BugOutlined />,
    quality: <FileSearchOutlined />,
    business: <ThunderboltOutlined />,
    integrity: <SafetyOutlined />
  };

  // Severity icons - updated for new levels
  const getSeverityIcon = (severity) => {
    if (severity === 'critical') return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    if (severity === 'moderate') return <WarningOutlined style={{ color: '#faad14' }} />;
    if (severity === 'minor') return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
  };

  // Group issues by severity
  const groupedIssues = {
    critical: validationResults.filter(i => i.severity === 'critical'),
    moderate: validationResults.filter(i => i.severity === 'moderate'),
    minor: validationResults.filter(i => i.severity === 'minor')
  };

  // Button text based on score
  const getButtonText = () => {
    if (!isReadyForDashboard && dataQualityScore < 50) return 'Quality Too Low';
    if (dataQualityScore >= 90) return 'Generate Dashboard';
    if (dataQualityScore >= 70) return 'Generate Dashboard';
    return 'Generate Dashboard (Review Warnings)';
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Quality Score Card */}
      {dataQualityScore !== undefined && (
        <Card
          style={{
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: '12px'
          }}
        >
          <Row gutter={24} align="middle">
            <Col span={8} style={{ textAlign: 'center' }}>
              <div style={{
                width: '120px',
                height: '120px',
                margin: '0 auto',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                border: `4px solid ${getScoreColor(dataQualityScore)}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{dataQualityScore}</div>
                <div style={{ fontSize: '14px', opacity: 0.8 }}>/ 100</div>
              </div>
            </Col>

            <Col span={16}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Title level={4} style={{ margin: 0, color: 'white' }}>
                  <StarOutlined /> {scoreCategory} Data Quality
                </Title>

                <Progress
                  percent={dataQualityScore}
                  strokeColor={getScoreColor(dataQualityScore)}
                  showInfo={false}
                  style={{ marginBottom: 8 }}
                />

                <Text style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {visualizationReadiness === 'ready' && '✓ Ready for dashboard creation'}
                  {visualizationReadiness === 'usable-with-caution' && '⚠️ Usable with caution - review warnings'}
                  {visualizationReadiness === 'not-recommended' && '✗ Not recommended for dashboards'}
                  {!visualizationReadiness && (isReadyForDashboard ? '✓ Ready for dashboard' : '⚠️ Review issues')}
                </Text>

                {confidence && (
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                    <ThunderboltOutlined /> AI Confidence: {(confidence * 100).toFixed(0)}%
                  </Text>
                )}
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* Strengths Card */}
      {strengths && strengths.length > 0 && (
        <Card
          style={{
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
            borderLeft: '4px solid #52c41a'
          }}
        >
          <Title level={5} style={{ color: '#52c41a', marginTop: 0 }}>
            <CheckCircleOutlined /> Data Strengths
          </Title>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {strengths.map((strength, idx) => (
              <div key={idx} style={{
                padding: '8px',
                background: 'rgba(255,255,255,0.7)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'flex-start'
              }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8, marginTop: 4 }} />
                <Text>{strength}</Text>
              </div>
            ))}
          </Space>
        </Card>
      )}

      {/* Business Insights Card */}
      {insights && insights.length > 0 && (
        <Card
          style={{
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)',
            borderLeft: '4px solid #1890ff',
            boxShadow: '0 2px 8px rgba(24,144,255,0.15)'
          }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Title level={5} style={{ color: '#1890ff', marginTop: 0, marginBottom: 0 }}>
                <BulbOutlined /> Key Business Insights
              </Title>
              {businessDomain && (
                <Tag color="blue" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {businessDomain}
                </Tag>
              )}
            </div>

            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px',
                    background: 'rgba(255,255,255,0.8)',
                    borderRadius: '6px',
                    borderLeft: '3px solid #1890ff',
                    display: 'flex',
                    alignItems: 'flex-start'
                  }}
                >
                  <BulbOutlined style={{ color: '#faad14', fontSize: '16px', marginRight: 10, marginTop: 2 }} />
                  <Text strong style={{ fontSize: '13px', lineHeight: '1.6' }}>{insight}</Text>
                </div>
              ))}
            </Space>
          </Space>
        </Card>
      )}

      {/* Business Questions Card */}
      {businessQuestions && businessQuestions.length > 0 && (
        <Card
          style={{
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%)',
            borderLeft: '4px solid #faad14',
            boxShadow: '0 2px 8px rgba(250,173,20,0.15)'
          }}
        >
          <Title level={5} style={{ color: '#d46b08', marginTop: 0 }}>
            <InfoCircleOutlined /> Questions This Data Can Answer
          </Title>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {businessQuestions.map((question, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.8)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'flex-start'
                }}
              >
                <Text style={{ color: '#d46b08', fontWeight: 'bold', marginRight: 8 }}>Q{idx + 1}:</Text>
                <Text style={{ fontSize: '13px', lineHeight: '1.6' }}>{question}</Text>
              </div>
            ))}
          </Space>
        </Card>
      )}

      {/* Visualization Recommendations */}
      {visualizationRecommendations && visualizationRecommendations.length > 0 && (
        <Card
          style={{
            marginBottom: '16px',
            background: '#f9f0ff',
            borderLeft: '4px solid #722ed1'
          }}
        >
          <Title level={5} style={{ color: '#722ed1', marginTop: 0 }}>
            <BarChartOutlined /> Recommended Visualizations
          </Title>
          <Row gutter={[12, 12]}>
            {visualizationRecommendations.map((rec, idx) => (
              <Col span={12} key={idx}>
                <Card size="small" style={{ borderRadius: '6px', border: '1px solid #d3adf7' }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Tag color="purple">{rec.chartType?.toUpperCase()}</Tag>
                    <Text strong style={{ fontSize: '13px' }}>{rec.reason}</Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      📊 Best columns: {rec.bestColumns?.join(', ')}
                    </Text>
                    {rec.caveat && (
                      <Text type="warning" style={{ fontSize: '11px' }}>⚠️ {rec.caveat}</Text>
                    )}
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Performance Warnings */}
      {performanceWarnings && performanceWarnings.length > 0 && (
        <Alert
          message="Performance Considerations"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              {performanceWarnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          }
          type="warning"
          showIcon
          icon={<ThunderboltOutlined />}
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* Main Status Alert */}
      <Alert
        message={currentStatus.title}
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>{currentStatus.description}</Text>
            <Text strong>{overallAssessment}</Text>
          </Space>
        }
        type={currentStatus.color}
        icon={currentStatus.icon}
        showIcon
        style={{ marginBottom: '16px' }}
      />

      {/* Summary Stats - Updated for new severity levels */}
      {summary && (
        <Space size="large" style={{ marginBottom: '16px', width: '100%', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">Total Issues</Text>
            <Title level={4} style={{ margin: 0 }}>{summary.totalIssues || 0}</Title>
          </div>
          <Divider type="vertical" style={{ height: '40px' }} />
          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: '#ff4d4f' }}>Critical</Text>
            <Title level={4} style={{ margin: 0, color: '#ff4d4f' }}>{summary.critical || 0}</Title>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: '#faad14' }}>Moderate</Text>
            <Title level={4} style={{ margin: 0, color: '#faad14' }}>{summary.moderate || 0}</Title>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: '#1890ff' }}>Minor</Text>
            <Title level={4} style={{ margin: 0, color: '#1890ff' }}>{summary.minor || 0}</Title>
          </div>
        </Space>
      )}

      {/* Detailed Issues */}
      {validationResults.length > 0 && (
        <Card style={{ marginBottom: '16px' }}>
          <Title level={5}>Validation Details</Title>

          {/* Critical Issues - Always Expanded */}
          {groupedIssues.critical.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <Divider orientation="left" style={{ color: '#ff4d4f', borderColor: '#ff4d4f' }}>
                🚨 Critical Issues ({groupedIssues.critical.length})
              </Divider>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {groupedIssues.critical.map((issue, idx) => renderIssueCard(issue, idx, isDarkMode))}
              </Space>
            </div>
          )}

          {/* Moderate Issues - Collapsible */}
          {groupedIssues.moderate.length > 0 && (
            <Collapse
              ghost
              defaultActiveKey={groupedIssues.critical.length > 0 ? [] : ['moderate']}
              style={{ marginBottom: '16px' }}
            >
              <Panel
                header={
                  <Text strong>⚠️ Moderate Issues ({groupedIssues.moderate.length}) - Review Recommended</Text>
                }
                key="moderate"
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {groupedIssues.moderate.map((issue, idx) => renderIssueCard(issue, idx, isDarkMode))}
                </Space>
              </Panel>
            </Collapse>
          )}

          {/* Minor Issues - Collapsible */}
          {groupedIssues.minor.length > 0 && (
            <Collapse ghost>
              <Panel
                header={
                  <Text type="secondary">ℹ️ Minor Observations ({groupedIssues.minor.length}) - Optional Review</Text>
                }
                key="minor"
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {groupedIssues.minor.map((issue, idx) => renderIssueCard(issue, idx, isDarkMode))}
                </Space>
              </Panel>
            </Collapse>
          )}
        </Card>
      )}

      {/* Action Buttons */}
      <Card style={{ textAlign: 'center' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space size="large">
            <Button
              size="large"
              onClick={onReupload}
            >
              {isReadyForDashboard ? 'Upload Different File' : 'Fix & Re-upload'}
            </Button>

            <Tooltip title={!isReadyForDashboard && dataQualityScore < 50 ? "Quality score too low - use 'Proceed Anyway' if needed" : ""}>
              <Button
                type="primary"
                size="large"
                onClick={onProceed}
                disabled={!isReadyForDashboard && dataQualityScore >= 50}
                icon={<RocketOutlined />}
                style={{
                  backgroundColor: dataQualityScore >= 70 ? '#52c41a' :
                                   dataQualityScore >= 50 ? '#faad14' : undefined
                }}
              >
                {getButtonText()}
              </Button>
            </Tooltip>

            {/* Manual Override Button */}
            {!isReadyForDashboard && dataQualityScore < 30 && (
              <Tooltip title="Generate dashboard despite severe quality issues - use with caution">
                <Button
                  type="dashed"
                  danger
                  size="large"
                  onClick={onProceed}
                  icon={<WarningOutlined />}
                >
                  Proceed Anyway
                </Button>
              </Tooltip>
            )}
          </Space>

          {!isReadyForDashboard && dataQualityScore >= 30 && (
            <Text type="warning">
              ⚠️ Please review the critical issues above before proceeding
            </Text>
          )}
        </Space>
      </Card>
    </div>
  );
};

// Helper function to render issue cards
const renderIssueCard = (issue, idx, isDarkMode) => (
  <Card
    key={idx}
    size="small"
    style={{
      borderLeft: `4px solid ${
        issue.severity === 'critical' ? '#ff4d4f' :
        issue.severity === 'moderate' ? '#faad14' : '#1890ff'
      }`
    }}
  >
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          {issue.severity === 'critical' && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
          {issue.severity === 'moderate' && <WarningOutlined style={{ color: '#faad14' }} />}
          {issue.severity === 'minor' && <InfoCircleOutlined style={{ color: '#1890ff' }} />}
          <Text strong>{issue.issue}</Text>
        </Space>
        <Tag color={getCategoryColor(issue.category)}>{issue.category}</Tag>
      </Space>

      {issue.affectedColumns && issue.affectedColumns.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: '12px' }}>Affected columns: </Text>
          {issue.affectedColumns.map(col => (
            <Tag key={col} style={{ fontSize: '11px' }}>{col}</Tag>
          ))}
        </div>
      )}

      {issue.dashboardImpact && (
        <Alert
          message="Dashboard Impact"
          description={issue.dashboardImpact}
          type={issue.canWorkAround ? "info" : "warning"}
          showIcon
          style={{ fontSize: '12px' }}
        />
      )}

      <div style={{
        padding: '8px',
        background: '#f6ffed',
        borderRadius: '4px',
        border: '1px solid #b7eb8f'
      }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          <BulbOutlined /> <strong>Recommendation:</strong> {issue.recommendation}
        </Text>
      </div>

      {issue.cleaningSuggestion && (
        <div style={{
          padding: '6px',
          background: '#fffbe6',
          borderRadius: '4px',
          border: '1px dashed #ffe58f'
        }}>
          <Text type="secondary" style={{ fontSize: '11px', fontStyle: 'italic' }}>
            💡 Cleaning Suggestion: {issue.cleaningSuggestion}
          </Text>
        </div>
      )}

      {issue.examples && issue.examples.length > 0 && (
        <Collapse ghost>
          <Panel
            header={<Text type="secondary" style={{ fontSize: '11px' }}>View examples ({issue.examples.length})</Text>}
            key="examples"
          >
            <div style={{
              background: isDarkMode ? '#1f1f1f' : '#fafafa',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'monospace'
            }}>
              {issue.examples.map((ex, i) => (
                <div key={i} style={{ padding: '2px 0', color: '#666' }}>• {ex}</div>
              ))}
            </div>
          </Panel>
        </Collapse>
      )}

      {issue.canWorkAround !== undefined && (
        <div>
          {issue.canWorkAround ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>Can work around</Tag>
          ) : (
            <Tag color="error" icon={<CloseCircleOutlined />}>Must fix before proceeding</Tag>
          )}
        </div>
      )}
    </Space>
  </Card>
);

// Helper function for category colors
const getCategoryColor = (category) => {
  const map = {
    schema: 'purple',
    datatype: 'red',
    quality: 'orange',
    business: 'blue',
    integrity: 'magenta'
  };
  return map[category] || 'default';
};

export default ValidationResults;
