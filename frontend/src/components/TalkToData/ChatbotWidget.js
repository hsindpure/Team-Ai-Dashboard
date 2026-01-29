// frontend/src/components/TalkToData/ChatbotWidget.jsx
// VOICE-ENABLED VERSION - With Speech Recognition

import React, { useState, useEffect, useRef } from 'react';
import { 
  Button, 
  Input, 
  Card, 
  Avatar, 
  Typography, 
  Space, 
  Tag, 
  Table,
  Spin,
  Tooltip,
  message as antMessage,
  Switch
} from 'antd';
import {
  MessageOutlined,
  SendOutlined,
  CloseOutlined,
  DeleteOutlined,
  RobotOutlined,
  UserOutlined,
  ThunderboltOutlined,
  AudioOutlined,
  AudioMutedOutlined,
  SoundOutlined
} from '@ant-design/icons';
import './chatbot.css';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const ChatbotWidget = ({ sessionId }) => {
  // Existing state
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  
  // Voice control state
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceReadEnabled, setVoiceReadEnabled] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);

  // Check browser support on mount
  useEffect(() => {
    checkVoiceSupport();
  }, []);

  // Load suggested questions on mount
  useEffect(() => {
    if (sessionId && isOpen) {
      loadSuggestedQuestions();
    }
  }, [sessionId, isOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Read bot responses aloud if voice read is enabled
  useEffect(() => {
    if (voiceReadEnabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.type === 'text') {
        speakText(lastMessage.content);
      }
    }
  }, [messages, voiceReadEnabled]);

  /**
   * Check if browser supports speech recognition and synthesis
   */
  const checkVoiceSupport = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechSynthesis = window.speechSynthesis;
    
    if (SpeechRecognition && speechSynthesis) {
      setSpeechSupported(true);
      
      // Initialize speech recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        console.log('🎤 Voice recognition started');
        setIsListening(true);
      };
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('📝 Voice transcript:', transcript);
        setInputMessage(transcript);
        setIsListening(false);
      };
      
      recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          antMessage.warning('No speech detected. Please try again.');
        } else if (event.error === 'not-allowed') {
          antMessage.error('Microphone access denied. Please enable it in browser settings.');
        } else {
          antMessage.error('Voice recognition error: ' + event.error);
        }
      };
      
      recognition.onend = () => {
        console.log('🎤 Voice recognition ended');
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
      synthRef.current = speechSynthesis;
      
    } else {
      setSpeechSupported(false);
      console.warn('Speech recognition not supported in this browser');
    }
  };

  /**
   * Start voice recognition
   */
  const startListening = () => {
    if (!recognitionRef.current) {
      antMessage.error('Voice recognition not available');
      return;
    }

    try {
      // Stop any ongoing speech synthesis
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      
      recognitionRef.current.start();
      setVoiceEnabled(true);
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      antMessage.error('Failed to start voice recognition');
    }
  };

  /**
   * Stop voice recognition
   */
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  /**
   * Speak text aloud
   */
  const speakText = (text) => {
    if (!synthRef.current || !voiceReadEnabled) return;

    // Cancel any ongoing speech
    synthRef.current.cancel();

    // Remove markdown formatting for speech
    const cleanText = text
      .replace(/\*\*/g, '')  // Remove bold
      .replace(/\*/g, '')    // Remove italics
      .replace(/#/g, '')     // Remove headers
      .replace(/`/g, '');    // Remove code blocks

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    // Try to use a more natural voice
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Female') || voice.name.includes('Samantha'))
    ) || voices.find(voice => voice.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    synthRef.current.speak(utterance);
  };

  /**
   * Stop speaking
   */
  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };

  /**
   * Load suggested questions from backend
   */
  const loadSuggestedQuestions = async () => {
    try {
      setLoadingQuestions(true);
      const response = await fetch(`/api/chatbot/questions/${sessionId}`);
      const data = await response.json();
      
      if (data.success) {
        setSuggestedQuestions(data.questions || []);
        
        // Add welcome message if no chat history
        if (messages.length === 0) {
          const welcomeMsg = {
            role: 'assistant',
            type: 'text',
            content: `Hi! I'm your data assistant. I've analyzed your dataset and can help you explore it. Try asking one of the suggested questions below, or ask me anything about your data!`,
            timestamp: new Date().toISOString()
          };
          setMessages([welcomeMsg]);
          
          // Speak welcome message if voice read is enabled
          if (voiceReadEnabled) {
            speakText(welcomeMsg.content);
          }
        }
      }
    } catch (error) {
      console.error('Error loading questions:', error);
      antMessage.error('Failed to load suggested questions');
    } finally {
      setLoadingQuestions(false);
    }
  };

  /**
   * Send message to chatbot
   */
  const sendMessage = async (messageText = null) => {
    const textToSend = messageText || inputMessage.trim();
    
    if (!textToSend) return;

    // Stop any ongoing speech
    stopSpeaking();

    // Add user message to UI
    const userMessage = {
      role: 'user',
      type: 'text',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Build conversation history
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call API
      const response = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: textToSend,
          conversationHistory
        })
      });

      const data = await response.json();

      if (data.success && data.response) {
        // Add bot response to UI
        const botMessage = {
          role: 'assistant',
          type: data.response.type,
          content: data.response.content,
          table: data.response.table,
          summary: data.response.summary,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, botMessage]);
        
        // Read response aloud if enabled and it's text
        if (voiceReadEnabled && botMessage.type === 'text') {
          speakText(botMessage.content);
        }
      } else {
        throw new Error(data.message || 'Failed to get response');
      }

    } catch (error) {
      console.error('Chat error:', error);
      antMessage.error('Failed to send message');
      
      // Add error message
      const errorMsg = {
        role: 'assistant',
        type: 'text',
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle suggested question click
   */
  const handleQuestionClick = (question) => {
    sendMessage(question);
  };

  /**
   * Clear chat history
   */
  const clearChat = async () => {
    try {
      stopSpeaking();
      
      await fetch(`/api/chatbot/history/${sessionId}`, {
        method: 'DELETE'
      });
      
      setMessages([]);
      loadSuggestedQuestions(); // Reload with welcome message
      antMessage.success('Chat cleared');
    } catch (error) {
      console.error('Error clearing chat:', error);
      antMessage.error('Failed to clear chat');
    }
  };

  /**
   * Scroll to bottom of messages
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  /**
   * Handle Enter key press
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Render a single message
   */
  const renderMessage = (msg, index) => {
    const isUser = msg.role === 'user';

    return (
      <div 
        key={index} 
        className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-bot'}`}
      >
        <div className="chat-message-avatar">
          {isUser ? (
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
          ) : (
            <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />
          )}
        </div>
        
        <div className="chat-message-content">
          {msg.type === 'table' && msg.table ? (
            <div className="chat-table-response">
              <Paragraph>{msg.content}</Paragraph>
              <Table
                columns={msg.table.columns}
                dataSource={msg.table.data}
                pagination={false}
                size="small"
                bordered
                scroll={{ x: true, y: 300 }}
                rowKey="_id"
              />
              {msg.summary && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                  {msg.summary}
                </Text>
              )}
            </div>
          ) : (
            <div className="chat-text-response">
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </Paragraph>
            </div>
          )}
          
          <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
            {new Date(msg.timestamp).toLocaleTimeString()}
          </Text>
        </div>
      </div>
    );
  };

  if (!isOpen) {
    // Collapsed state - floating button
    return (
      <div className="chatbot-collapsed">
        <Tooltip title="Talk to Data" placement="left">
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<MessageOutlined />}
            onClick={() => setIsOpen(true)}
            className="chatbot-toggle-btn"
          />
        </Tooltip>
      </div>
    );
  }

  // Expanded state - chat window
  return (
    <div className="chatbot-expanded">
      <Card
        className="chatbot-card"
        title={
          <Space>
            <RobotOutlined style={{ fontSize: 20, color: '#52c41a' }} />
            <Text strong>Talk to Data</Text>
            {speechSupported && (
              <Tooltip title={voiceEnabled ? "Voice enabled" : "Voice available"}>
                {voiceEnabled ? (
                  <AudioOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <AudioMutedOutlined style={{ color: '#999' }} />
                )}
              </Tooltip>
            )}
          </Space>
        }
        extra={
          <Space>
            {/* Voice Read Toggle */}
            {speechSupported && (
              <Tooltip title={voiceReadEnabled ? "Auto-read responses: ON" : "Auto-read responses: OFF"}>
                <Switch
                  size="small"
                  checked={voiceReadEnabled}
                  onChange={setVoiceReadEnabled}
                  checkedChildren={<SoundOutlined />}
                  unCheckedChildren={<SoundOutlined />}
                />
              </Tooltip>
            )}
            
            <Tooltip title="Clear chat">
              <Button 
                type="text" 
                size="small" 
                icon={<DeleteOutlined />}
                onClick={clearChat}
              />
            </Tooltip>
            <Tooltip title="Close">
              <Button 
                type="text" 
                size="small" 
                icon={<CloseOutlined />}
                onClick={() => {
                  stopSpeaking();
                  setIsOpen(false);
                }}
              />
            </Tooltip>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
      >
        {/* Suggested Questions */}
        {suggestedQuestions.length > 0 && messages.length <= 1 && (
          <div className="suggested-questions">
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block', padding: '0 12px' }}>
              <ThunderboltOutlined /> Suggested Questions:
            </Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 12px' }}>
              {suggestedQuestions.map((question, idx) => (
                <Tag
                  key={idx}
                  color="blue"
                  style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => handleQuestionClick(question)}
                >
                  {question}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div className="chatbot-messages">
          {loadingQuestions ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin tip="Loading..." />
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => renderMessage(msg, idx))}
              
              {isLoading && (
                <div className="chat-message chat-message-bot">
                  <div className="chat-message-avatar">
                    <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />
                  </div>
                  <div className="chat-message-content">
                    <Spin size="small" />
                    <Text type="secondary" style={{ marginLeft: 8 }}>Thinking...</Text>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="chatbot-input">
          <TextArea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isListening ? "🎤 Listening..." : "Type or click 🎤 to speak..."}
            autoSize={{ minRows: 1, maxRows: 3 }}
            disabled={isLoading || isListening}
            className={isListening ? 'voice-active' : ''}
          />
          
          {/* Voice Input Button */}
          {speechSupported && (
            <Tooltip title={isListening ? "Stop listening" : "Speak your question"}>
              <Button
                type={isListening ? "primary" : "default"}
                danger={isListening}
                icon={<AudioOutlined />}
                onClick={isListening ? stopListening : startListening}
                disabled={isLoading}
                className={isListening ? 'voice-recording' : ''}
              />
            </Tooltip>
          )}
          
          {/* Send Button */}
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => sendMessage()}
            loading={isLoading}
            disabled={!inputMessage.trim() || isListening}
          >
            Send
          </Button>
        </div>

        {/* Voice indicator */}
        {isListening && (
          <div style={{ 
            padding: '8px 16px', 
            background: '#fff1f0', 
            borderTop: '1px solid #ffccc7',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Spin size="small" />
            <Text type="danger" style={{ fontSize: 12 }}>
              🎤 Listening... Speak your question now!
            </Text>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ChatbotWidget;
