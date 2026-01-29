import ChatbotWidget from './TalkToData/ChatbotWidget';


const [sessionId, setSessionId] = useState(null);  
const [uploadComplete, setUploadComplete] = useState(false);


  if (response.success) {
        setUploadStatus('validating');
        message.info('File uploaded successfully! Running data validation...');

        await new Promise(resolve => setTimeout(resolve, 500));

        // Store validation results and session data
        setValidationResult(response.validationResult);
        setSessionData(response); // Store full response
        setUploadStatus('success');

        setSessionId(response.sessionId);  // ⭐ SET SESSION ID
        
        setUploadComplete(true);


 {sessionId && uploadComplete && <ChatbotWidget sessionId={sessionId} />}
