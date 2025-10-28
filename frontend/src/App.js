// frontend/src/App.js
import React, { useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import LandingPage from './components/LandingPage';
import ExactNorthernLightsPage from './components/ExactNorthernLightsPage'
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import './App.css';


function App() {
  const [currentStep, setCurrentStep] = useState('landing'); // landing, upload, dashboard
  const [sessionId, setSessionId] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [userContext, setUserContext] = useState(null);

  const handleGetStarted = () => {
    setCurrentStep('upload');
  };

  const handleFileUploaded = (sessionData) => {
    setSessionId(sessionData.sessionId);
    setFileInfo(sessionData.preview);
    setUserContext(sessionData.userContext); // Store user context
    setCurrentStep('dashboard');
  };

  const handleBackToUpload = () => {
    setCurrentStep('upload');
    setSessionId(null);
    setFileInfo(null);
    setUserContext(null);  // ✅ ADD THIS LINE
  };
  
  const handleBackToLanding = () => {
    setCurrentStep('landing');
    setSessionId(null);
    setFileInfo(null);
    setUserContext(null);  // ✅ ADD THIS LINE
  };
  
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
        },
      }}
    >
      <div className={`app ${isDarkMode ? 'dark' : 'light'}`}>
        {currentStep === 'landing' && (
          <>
          <LandingPage 
            onGetStarted={handleGetStarted}
            onToggleTheme={toggleTheme}
            isDarkMode={isDarkMode}
          />
          <ExactNorthernLightsPage 
                onGetStarted={handleGetStarted}
            onToggleTheme={toggleTheme}
            isDarkMode={isDarkMode}
          />
          </>
        )}
        
        {currentStep === 'upload' && (
          <FileUpload 
            onFileUploaded={handleFileUploaded}
            onBack={handleBackToLanding}
            onToggleTheme={toggleTheme}
            isDarkMode={isDarkMode}
          />
        )}
        
        {currentStep === 'dashboard' && sessionId && (
          <Dashboard 
              sessionId={sessionId}
              fileInfo={fileInfo}
              userContext={userContext} // Pass context
              onBack={handleBackToUpload}
              onNewFile={handleBackToLanding}
              onToggleTheme={toggleTheme}
              isDarkMode={isDarkMode}
          />
        )}
      </div>


     

          
    </ConfigProvider>

  
    
  );
}

export default App;