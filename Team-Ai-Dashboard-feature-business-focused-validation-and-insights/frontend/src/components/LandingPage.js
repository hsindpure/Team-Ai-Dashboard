// frontend/src/components/LandingPage.js
import React from 'react';
import { Button, Typography, Row, Col, Card, Space, Switch } from 'antd';
import { 
  RocketOutlined, 
  ThunderboltOutlined, 
  BarChartOutlined, 
  BulbOutlined,
  FileTextOutlined,
  FilterOutlined,
  MobileOutlined,
  SunOutlined,
  MoonOutlined
} from '@ant-design/icons';

const { Title, Paragraph } = Typography;

const LandingPage = ({ onGetStarted, onToggleTheme, isDarkMode }) => {
  const features = [
    {
      icon: <FileTextOutlined style={{ fontSize: '24px', color: '#1890ff' }} />,
      title: 'Smart File Processing',
      description: 'Upload CSV or Excel files up to 100MB. Automatic data type detection and schema generation.'
    },
    {
      icon: <BulbOutlined style={{ fontSize: '24px', color: '#52c41a' }} />,
      title: 'AI-Powered Insights',
      description: 'Get intelligent KPI suggestions and chart recommendations based on your data patterns.'
    },
    {
      icon: <BarChartOutlined style={{ fontSize: '24px', color: '#fa8c16' }} />,
      title: 'Interactive Visualizations',
      description: '15+ chart types with real-time filtering and responsive design for all devices.'
    },
    {
      icon: <ThunderboltOutlined style={{ fontSize: '24px', color: '#f5222d' }} />,
      title: 'Real-time Filtering',
      description: 'Instant chart updates without reload. Multi-select filters with search functionality.'
    },
    {
      icon: <FilterOutlined style={{ fontSize: '24px', color: '#722ed1' }} />,
      title: 'No-Code Dashboard',
      description: 'Create professional dashboards without any coding. Drag, drop, and customize easily.'
    },
    {
      icon: <MobileOutlined style={{ fontSize: '24px', color: '#eb2f96' }} />,
      title: 'Mobile Responsive',
      description: 'Perfect viewing experience on desktop, tablet, and mobile devices with smooth animations.'
    }
  ];

  const demoData = [
    { name: 'Sales Dashboard', description: 'Revenue analysis with regional breakdown' },
    { name: 'Marketing Analytics', description: 'Campaign performance and ROI tracking' },
    { name: 'Operations Report', description: 'KPI monitoring and trend analysis' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: isDarkMode ? '#141414' : '#f0f2f5' }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        background: isDarkMode ? '#001529' : '#fff',
        borderBottom: `1px solid ${isDarkMode ? '#434343' : '#f0f0f0'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BarChartOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
          <Title level={4} style={{ margin: 0, color: isDarkMode ? '#fff' : '#000' }}>
            AI Dashboard Platform
          </Title>
        </div>
        <Space>
          <SunOutlined />
          <Switch checked={isDarkMode} onChange={onToggleTheme} />
          <MoonOutlined />
        </Space>
      </div>

      {/* Hero Section */}
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <Title level={1} style={{ fontSize: '48px', marginBottom: '24px', color: isDarkMode ? '#fff' : '#000' }}>
          Transform Your Data Into
          <br />
          <span style={{ color: '#1890ff' }}>Intelligent Dashboards</span>
        </Title>
        
        <Paragraph style={{ 
          fontSize: '20px', 
          marginBottom: '40px', 
          maxWidth: '600px', 
          margin: '0 auto 40px',
          color: isDarkMode ? '#a0a0a0' : '#666'
        }}>
          Upload your CSV or Excel files and get AI-powered insights with interactive visualizations 
          in seconds. No coding required.
        </Paragraph>

        <Space size="large">
          <Button 
            type="primary" 
            size="large" 
            icon={<RocketOutlined />}
            onClick={onGetStarted}
            style={{ height: '50px', fontSize: '16px', padding: '0 32px' }}
          >
            Get Started Free
          </Button>
          
          <Button 
            size="large" 
            style={{ height: '50px', fontSize: '16px', padding: '0 32px' }}
          >
            View Demo
          </Button>
        </Space>

        {/* Stats */}
        <Row gutter={32} style={{ marginTop: '60px', maxWidth: '600px', margin: '60px auto 0' }}>
          <Col span={8} style={{ textAlign: 'center' }}>
            <Title level={2} style={{ color: '#1890ff', margin: 0 }}>30s</Title>
            <Paragraph style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>Setup Time</Paragraph>
          </Col>
          <Col span={8} style={{ textAlign: 'center' }}>
            <Title level={2} style={{ color: '#52c41a', margin: 0 }}>15+</Title>
            <Paragraph style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>Chart Types</Paragraph>
          </Col>
          <Col span={8} style={{ textAlign: 'center' }}>
            <Title level={2} style={{ color: '#fa8c16', margin: 0 }}>100MB</Title>
            <Paragraph style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>File Limit</Paragraph>
          </Col>
        </Row>
      </div>

      {/* Features Section */}
      <div style={{ padding: '80px 24px', background: isDarkMode ? '#1f1f1f' : '#fff' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: '60px', color: isDarkMode ? '#fff' : '#000' }}>
            Powerful Features for Data Analysis
          </Title>
          
          <Row gutter={[32, 32]}>
            {features.map((feature, index) => (
              <Col xs={24} sm={12} lg={8} key={index}>
                <Card 
                  hoverable
                  style={{ 
                    height: '100%',
                    background: isDarkMode ? '#2a2a2a' : '#fff',
                    borderColor: isDarkMode ? '#434343' : '#f0f0f0'
                  }}
                  bodyStyle={{ padding: '24px' }}
                >
                  <div style={{ marginBottom: '16px' }}>
                    {feature.icon}
                  </div>
                  <Title level={4} style={{ marginBottom: '12px', color: isDarkMode ? '#fff' : '#000' }}>
                    {feature.title}
                  </Title>
                  <Paragraph style={{ color: isDarkMode ? '#a0a0a0' : '#666', marginBottom: 0 }}>
                    {feature.description}
                  </Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* Demo Section */}
      <div style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <Title level={2} style={{ marginBottom: '24px', color: isDarkMode ? '#fff' : '#000' }}>
            See What You Can Build
          </Title>
          <Paragraph style={{ 
            fontSize: '16px', 
            marginBottom: '40px',
            color: isDarkMode ? '#a0a0a0' : '#666'
          }}>
            From sales analytics to marketing insights, create professional dashboards in minutes.
          </Paragraph>

          <Row gutter={[24, 24]}>
            {demoData.map((demo, index) => (
              <Col xs={24} sm={8} key={index}>
                <Card 
                  hoverable
                  style={{ 
                    background: isDarkMode ? '#2a2a2a' : '#fff',
                    borderColor: isDarkMode ? '#434343' : '#f0f0f0'
                  }}
                >
                  <div style={{ 
                    height: '120px', 
                    background: `linear-gradient(45deg, ${['#1890ff', '#52c41a', '#fa8c16'][index]}20, ${['#1890ff', '#52c41a', '#fa8c16'][index]}40)`,
                    borderRadius: '6px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <BarChartOutlined style={{ fontSize: '32px', color: ['#1890ff', '#52c41a', '#fa8c16'][index] }} />
                  </div>
                  <Title level={5} style={{ marginBottom: '8px', color: isDarkMode ? '#fff' : '#000' }}>
                    {demo.name}
                  </Title>
                  <Paragraph style={{ fontSize: '14px', color: isDarkMode ? '#a0a0a0' : '#666', marginBottom: 0 }}>
                    {demo.description}
                  </Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* CTA Section */}
      <div style={{ 
        padding: '80px 24px', 
        background: isDarkMode ? '#001529' : '#1890ff',
        textAlign: 'center'
      }}>
        <Title level={2} style={{ color: '#fff', marginBottom: '24px' }}>
          Ready to Get Started?
        </Title>
        <Paragraph style={{ fontSize: '18px', color: '#fff', marginBottom: '40px' }}>
          Upload your first file and create stunning dashboards in under a minute.
        </Paragraph>
        <Button 
          type="primary" 
          size="large"
          ghost
          icon={<RocketOutlined />}
          onClick={onGetStarted}
          style={{ 
            height: '50px', 
            fontSize: '16px', 
            padding: '0 32px',
            borderColor: '#fff',
            color: '#fff'
          }}
        >
          Start Building Now
        </Button>
      </div>

      {/* Footer */}
      <div style={{ 
        padding: '40px 24px', 
        textAlign: 'center',
        background: isDarkMode ? '#141414' : '#f0f2f5',
        borderTop: `1px solid ${isDarkMode ? '#434343' : '#d9d9d9'}`
      }}>
        <Paragraph style={{ marginBottom: 0, color: isDarkMode ? '#a0a0a0' : '#666' }}>
          AI Dashboard Platform - Transform your data into insights
        </Paragraph>
      </div>
    </div>
  );
};

export default LandingPage;