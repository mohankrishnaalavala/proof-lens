import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Send, AlertCircle } from 'lucide-react';
import type { ChromeAICapabilities, ChatMessage } from '@/lib/types/messages';

interface ChatTabProps {
  capabilities: ChromeAICapabilities | null;
}

export function ChatTab({ capabilities }: ChatTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextText, setContextText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for text extraction messages
    const handleMessage = (message: any) => {
      if (message.type === 'TL_TEXT_EXTRACTED' && message.payload?.action === 'ask-analyst') {
        setContextText(message.payload.text);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      content: inputValue,
      role: 'user',
      timestamp: Date.now(),
      source: 'on-device',
      ...(contextText && { context: contextText })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // TODO: This will be implemented in Agent 4 (AI Adapters)
      // For now, show mock response
      await new Promise(resolve => setTimeout(resolve, 1500));

      const source = capabilities?.promptAPI?.available ? 'on-device' : 'cloud';
      
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        content: `I understand you're asking about: "${userMessage.content}". This is a mock response that will be replaced with actual AI analysis in the next phase. ${contextText ? `I can see you've provided context about: "${contextText.substring(0, 100)}..."` : ''}`,
        role: 'assistant',
        timestamp: Date.now(),
        source,
        ...(contextText && { context: contextText })
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearContext = () => {
    setContextText(null);
  };

  if (messages.length === 0 && !contextText) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 p-6">
        <div className="flex items-center justify-center w-16 h-16 bg-muted rounded-full">
          <MessageCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Ask the Analyst</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Chat with our AI analyst for research help. Uses on-device AI when available, 
            with cloud fallback option.
          </p>
        </div>

        <div className="w-full max-w-md space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Ask a question..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button 
              onClick={handleSendMessage} 
              disabled={!inputValue.trim() || isLoading}
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Or select text and use: <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Alt+Shift+A</kbd>
            </p>
          </div>
        </div>

        {!capabilities?.promptAPI?.available && (
          <Card className="w-full max-w-md border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800">Cloud fallback available</p>
                  <p className="text-orange-700">
                    On-device AI not available. Enable cloud fallback in options for full functionality.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context Banner */}
      {contextText && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-800 mb-1">Context provided</p>
                <p className="text-xs text-blue-700 truncate">
                  {contextText.substring(0, 150)}{contextText.length > 150 ? '...' : ''}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={clearContext} className="text-blue-600">
                ✕
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-xs opacity-70">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
                {message.role === 'assistant' && (
                  <Badge 
                    variant={message.source === 'on-device' ? 'source-ondevice' : 'source-cloud'}
                    className="text-xs"
                  >
                    {message.source === 'on-device' ? 'On-device' : 'Cloud'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="Ask a question..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={isLoading}
        />
        <Button 
          onClick={handleSendMessage} 
          disabled={!inputValue.trim() || isLoading}
          size="sm"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
