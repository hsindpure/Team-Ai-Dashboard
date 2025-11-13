// frontend/src/components/FileUpload.js - FIXED VERSION
import React, { useState , useEffect } from 'react';
import {
  Upload,
  Button,
  Card,
  Typography,
  Space,
  Progress,
  Alert,
  message,
  Row,
  Col,
  Statistic,
  Spin,
  Switch,
  Input,        // ADD THIS
  Tag  
} from 'antd';
import {
  InboxOutlined,
  UploadOutlined,
  FileExcelOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  SunOutlined,
  MoonOutlined,
  BulbOutlined,      // ADD THIS
  ThunderboltOutlined // ADD THIS
} from '@ant-design/icons';
import { uploadFile } from '../services/api';
import { formatFileSize } from '../utils/helpers';
import ValidationResults from './ValidationResults';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;  // ADD THIS LINE

const FileUpload = ({ onFileUploaded, onBack, onToggleTheme, isDarkMode }) => {
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [userContext, setUserContext] = useState('');
  const [showContextInput, setShowContextInput] = useState(false);


  // Handle file selection
  const handleBeforeUpload = (file) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!allowedTypes.includes(fileExtension)) {
      message.error('Please upload only CSV or Excel files (.csv, .xlsx, .xls)');
      return Upload.LIST_IGNORE;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error('File size must be less than 100MB');
      return Upload.LIST_IGNORE;
    }

    handleUpload(file);
    return false;
  };

  // Handle file upload
  const handleUpload = async (file) => {
    try {
      setUploadStatus('uploading');
      setErrorMessage(null);
      setUploadProgress(0);

      setFileInfo({
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type || 'application/octet-stream'
      });

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      console.log('📤 Uploading file:', file.name);
      const response = await uploadFile(file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      console.log('📥 Upload response:', response);

      if (response.success) {
        setUploadStatus('validating');
        message.info('File uploaded successfully! Running data validation...');

        await new Promise(resolve => setTimeout(resolve, 500));

        // Store validation results and session data
        setValidationResult(response.validationResult);
        setSessionData(response); // Store full response
        setUploadStatus('success');

        // Show validation messages
        if (response.validationResult.overallStatus === 'valid') {
          message.success({
            content: 'Data validation passed! Your data is clean and ready.',
            duration: 3
          });
        } else if (response.validationResult.overallStatus === 'warning') {
          message.warning({
            content: 'Data validation found some warnings. Please review before proceeding.',
            duration: 4
          });
        } else {
          message.error({
            content: 'Data validation failed. Critical issues found - please fix your data.',
            duration: 5
          });
        }

      } else {
        throw new Error(response.message || 'Upload failed');
      }

    } catch (error) {
      console.error('❌ Upload error:', error);
      setUploadStatus('error');
      setErrorMessage(error.message || 'Failed to upload file. Please try again.');
      setUploadProgress(0);
      message.error(error.message || 'Upload failed');
    }
  };

  useEffect(() => {
    if (validationResult?.isReadyForDashboard) {
      setShowContextInput(true);
    }
  }, [validationResult]);

  // 🔥 FIXED: Handle proceed to dashboard
  const handleProceed = () => {
    if (!sessionData || !validationResult) {
      message.error('Session data not available');
      return;
    }

    if (!validationResult.isReadyForDashboard) {
      message.error('Cannot proceed - please fix data validation errors');
      return;
    }

    console.log('✅ Proceeding to dashboard');
    console.log('📊 Session ID:', sessionData.sessionId);
    console.log('📊 User Context:', userContext || 'No context provided');
    console.log('📊 Full session data:', sessionData);

    if (!sessionData.sessionId) {
      console.error('❌ ERROR: sessionId is missing!');
      console.error('Response structure:', JSON.stringify(sessionData, null, 2));
      message.error('Session ID is missing. Please try uploading again.');
      return;
    }

    // ✅ MODIFIED: Pass the data WITH userContext to parent component
    onFileUploaded({
      sessionId: sessionData.sessionId,
      preview: sessionData.preview,
      userContext: userContext.trim() || null // Pass context, null if empty
    });
  };

  // Handle re-upload
  const handleReupload = () => {
    console.log('🔄 Resetting for new upload');
    setUploadStatus('idle');
    setUploadProgress(0);
    setFileInfo(null);
    setValidationResult(null);
    setSessionData(null);
    setErrorMessage(null);
    // ✅ ADD THESE TWO LINES
    setUserContext('');
    setShowContextInput(false);
  };

  // Upload dragger props
  const draggerProps = {
    name: 'file',
    multiple: false,
    accept: '.csv,.xlsx,.xls',
    beforeUpload: handleBeforeUpload,
    showUploadList: false,
    disabled: uploadStatus !== 'idle'
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: isDarkMode ? '#141414' : '#f0f2f5',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        marginBottom: '24px'
      }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={onBack}
                size="large"
              >
                Back
              </Button>
              <Title level={3} style={{ margin: 0, color: isDarkMode ? '#fff' : '#000' }}>
                Upload Your Data
              </Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <SunOutlined />
              <Switch checked={isDarkMode} onChange={onToggleTheme} />
              <MoonOutlined />
            </Space>
          </Col>
        </Row>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        {/* Upload Section - Show when idle */}
        {uploadStatus === 'idle' && (
          <Card
            style={{
              background: isDarkMode ? '#1f1f1f' : '#fff',
              borderColor: isDarkMode ? '#434343' : '#f0f0f0'
            }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <Title level={4} style={{ color: isDarkMode ? '#fff' : '#000' }}>
                  Upload CSV or Excel File
                </Title>
                <Paragraph style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Upload your data file to generate intelligent dashboards with AI-powered insights
                </Paragraph>
              </div>

              <Dragger {...draggerProps} style={{ padding: '40px 20px' }}>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: '#1890ff', fontSize: '48px' }} />
                </p>
                <p className="ant-upload-text" style={{ color: isDarkMode ? '#fff' : '#000' }}>
                  Click or drag file to this area to upload
                </p>
                <p className="ant-upload-hint" style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>
                  Supports CSV, Excel (.xlsx, .xls) files up to 100MB
                </p>
              </Dragger>

              <Alert
                message="File Requirements"
                description={
                  <ul style={{ marginBottom: 0, paddingLeft: '20px' }}>
                    <li>File formats: CSV, Excel (.xlsx, .xls)</li>
                    <li>Maximum file size: 100MB</li>
                    <li>Must contain column headers</li>
                    <li>Data should be in tabular format</li>
                    <li>Recommended: Include date columns for time-based analysis</li>
                  </ul>
                }
                type="info"
                showIcon
              />

              <Row gutter={16}>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', background: isDarkMode ? '#2a2a2a' : '#fafafa' }}>
                    <FileExcelOutlined style={{ fontSize: '24px', color: '#52c41a' }} />
                    <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: '12px' }}>
                      Smart Processing
                    </Paragraph>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', background: isDarkMode ? '#2a2a2a' : '#fafafa' }}>
                    <CheckCircleOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
                    <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: '12px' }}>
                      AI Validation
                    </Paragraph>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ textAlign: 'center', background: isDarkMode ? '#2a2a2a' : '#fafafa' }}>
                    <UploadOutlined style={{ fontSize: '24px', color: '#fa8c16' }} />
                    <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: '12px' }}>
                      Instant Insights
                    </Paragraph>
                  </Card>
                </Col>
              </Row>
            </Space>
          </Card>
        )}

        {/* Uploading Section */}
        {uploadStatus === 'uploading' && (
          <Card
            style={{
              background: isDarkMode ? '#1f1f1f' : '#fff',
              borderColor: isDarkMode ? '#434343' : '#f0f0f0',
              textAlign: 'center'
            }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Spin size="large" />
              
              <div>
                <Title level={4} style={{ color: isDarkMode ? '#fff' : '#000' }}>
                  Uploading File...
                </Title>
                {fileInfo && (
                  <Text type="secondary">
                    {fileInfo.name} ({fileInfo.size})
                  </Text>
                )}
              </div>

              <Progress
                percent={uploadProgress}
                status="active"
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
                style={{ maxWidth: '500px', margin: '0 auto' }}
              />

              <Text type="secondary">
                Please wait while we process your file...
              </Text>
            </Space>
          </Card>
        )}

        {/* Validating Section */}
        {uploadStatus === 'validating' && (
          <Card
            style={{
              background: isDarkMode ? '#1f1f1f' : '#fff',
              borderColor: isDarkMode ? '#434343' : '#f0f0f0',
              textAlign: 'center'
            }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Spin size="large" />
              
              <div>
                <Title level={4} style={{ color: isDarkMode ? '#fff' : '#000' }}>
                  Running AI Data Validation...
                </Title>
                <Text type="secondary">
                  Analyzing data quality, checking for errors, and verifying integrity
                </Text>
              </div>

              <div style={{
                background: isDarkMode ? '#2a2a2a' : '#f5f5f5',
                padding: '20px',
                borderRadius: '8px',
                maxWidth: '500px',
                margin: '0 auto'
              }}>
                <Space direction="vertical" size="small" style={{ width: '100%', textAlign: 'left' }}>
                  <Text>✓ Schema validation</Text>
                  <Text>✓ Data type checking</Text>
                  <Text>✓ Quality assessment</Text>
                  <Text>✓ Business logic validation</Text>
                  <Text>✓ Integrity verification</Text>
                </Space>
              </div>
            </Space>
          </Card>
        )}

        {/* Success Section with Validation Results */}
        {uploadStatus === 'success' && validationResult && (
          <>
            {/* File Info Card */}
            <Card
              style={{
                background: isDarkMode ? '#1f1f1f' : '#fff',
                borderColor: isDarkMode ? '#434343' : '#f0f0f0',
                marginBottom: '24px'
              }}
            >
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic
                    title="File Name"
                    value={sessionData?.preview?.fileName || fileInfo?.name || 'N/A'}
                    valueStyle={{ fontSize: '14px', color: isDarkMode ? '#fff' : '#000' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Total Rows"
                    value={sessionData?.preview?.totalRows || 0}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Total Columns"
                    value={sessionData?.preview?.totalColumns || 0}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="File Size"
                    value={sessionData?.preview?.fileSize || fileInfo?.size || 'N/A'}
                    valueStyle={{ fontSize: '16px', color: '#fa8c16' }}
                  />
                </Col>
              </Row>

              <Row gutter={16} style={{ marginTop: '16px' }}>
                <Col span={12}>
                  <Statistic
                    title="Measures (Numeric)"
                    value={sessionData?.preview?.measures || 0}
                    prefix={<FileExcelOutlined />}
                    valueStyle={{ color: '#722ed1' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Dimensions (Categorical)"
                    value={sessionData?.preview?.dimensions || 0}
                    prefix={<FileExcelOutlined />}
                    valueStyle={{ color: '#eb2f96' }}
                  />
                </Col>
              </Row>

              {/* 🔥 DEBUG INFO - Remove this after testing */}
              {sessionData && (
                <Alert
                  message="Debug Info"
                  description={
                    <div>
                      <Text>Session ID: {sessionData.sessionId || 'MISSING!'}</Text><br/>
                      <Text>Has Preview: {sessionData.preview ? 'Yes' : 'No'}</Text><br/>
                      <Text>Validation Ready: {validationResult.isReadyForDashboard ? 'Yes' : 'No'}</Text>
                    </div>
                  }
                  type="info"
                  style={{ marginTop: '16px' }}
                />
              )}
              </Card>

              {/* ✅ ADD THIS ENTIRE CONTEXT INPUT CARD HERE */}
              {showContextInput && (
                <Card
                  style={{
                    marginTop: '24px',
                    background: isDarkMode ? '#1f1f1f' : '#fff',
                    borderColor: '#1890ff',
                    borderWidth: '2px'
                  }}
                  title={
                    <Space>
                      <BulbOutlined style={{ color: '#1890ff', fontSize: '20px' }} />
                      <Text strong style={{ fontSize: '16px', color: isDarkMode ? '#fff' : '#000' }}>
                        Tell AI What You're Looking For (Optional)
                      </Text>
                      <Tag color="blue">AI Enhanced</Tag>
                    </Space>
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Alert
                      message="Help AI Understand Your Goals"
                      description="Describe what insights you want to see, specific trends to analyze, or business questions you need answered. The AI will tailor the dashboard to your needs."
                      type="info"
                      showIcon
                      icon={<ThunderboltOutlined />}
                    />

                    <TextArea
                      value={userContext}
                      onChange={(e) => setUserContext(e.target.value)}
                      placeholder="Example:
              - Show me sales trends by region with focus on Q4 performance
              - I want to identify top-performing products and their revenue contribution
              - Highlight any seasonal patterns in customer behavior
              - Compare year-over-year growth across all metrics
              - Focus on recent trends and anomalies"
                      rows={6}
                      maxLength={2000}
                      showCount
                      style={{
                        fontSize: '14px',
                        background: isDarkMode ? '#141414' : '#fafafa',
                        borderColor: userContext.length > 1500 ? '#faad14' : undefined
                      }}
                    />

                    {/* Quick Suggestion Tags */}
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                        💡 Click to add suggestions:
                      </Text>
                      <Space wrap>
                        {[
                          "Show key performance trends over time",
                          "Identify top and bottom performers",
                          "Compare metrics across categories",
                          "Highlight anomalies and outliers",
                          "Focus on recent period analysis"
                        ].map((suggestion, idx) => (
                          <Tag
                            key={idx}
                            style={{ cursor: 'pointer' }}
                            color="blue"
                            onClick={() => setUserContext(prev => 
                              prev ? `${prev}\n• ${suggestion}` : `• ${suggestion}`
                            )}
                          >
                            + {suggestion}
                          </Tag>
                        ))}
                      </Space>
                    </div>

                    <Alert
                      message={
                        <Text style={{ fontSize: '12px' }}>
                          {userContext.length === 0 && "ℹ️ Leave blank for automatic AI analysis based on your data patterns."}
                          {userContext.length > 0 && userContext.length < 100 && "✅ Good start! Add more details for better results."}
                          {userContext.length >= 100 && userContext.length < 500 && "✅ Great! The AI has good context to work with."}
                          {userContext.length >= 500 && userContext.length < 1500 && "⭐ Excellent detail! This will help create a highly targeted dashboard."}
                          {userContext.length >= 1500 && "⚠️ Approaching limit. Consider being more concise."}
                        </Text>
                      }
                      type={
                        userContext.length === 0 ? 'info' :
                        userContext.length < 500 ? 'success' :
                        userContext.length < 1500 ? 'success' : 'warning'
                      }
                      showIcon={false}
                      style={{ marginTop: '8px' }}
                    />

                    <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: '11px' }}>
                      💬 The more specific you are, the better the AI can tailor your dashboard.
                      Character limit: 2000
                    </Paragraph>
                  </Space>
                </Card>
              )}

              {/* Validation Results Component */}
              <ValidationResults
                validationResult={validationResult}
                onProceed={handleProceed}
                onReupload={handleReupload}
                isDarkMode={isDarkMode}
              />
          </>
        )}

        {/* Error Section */}
        {uploadStatus === 'error' && (
          <Card
            style={{
              background: isDarkMode ? '#1f1f1f' : '#fff',
              borderColor: '#ff4d4f',
              borderWidth: '2px'
            }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Alert
                message="Upload Failed"
                description={errorMessage || 'An error occurred while uploading your file'}
                type="error"
                showIcon
              />

              <div style={{ textAlign: 'center' }}>
                <Space>
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    onClick={handleReupload}
                    size="large"
                  >
                    Try Again
                  </Button>
                  <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={onBack}
                    size="large"
                  >
                    Go Back
                  </Button>
                </Space>
              </div>
            </Space>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FileUpload;