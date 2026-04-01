import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Send, AlertCircle, Lightbulb, Search } from 'lucide-react';
import { useCapabilities, useChatMutation } from '@/lib/state';
import { useTruthLensStore } from '@/lib/state/store';
import { truthLensCache } from '@/lib/state/cache';
import type { ChatMessage } from '@/lib/types/messages';

export function ChatTab() {
  const capabilities = useCapabilities();
  const addChatMessage = useTruthLensStore((s) => s.addChatMessage);
  const chatMutation = useChatMutation();
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
      // Use the actual AI chat mutation
      const prompt = contextText
        ? `Context: ${contextText}\n\nQuestion: ${userMessage.content}`
        : userMessage.content;

      const response = await chatMutation.mutateAsync({
        message: prompt,
        useCloud: !capabilities?.chromeAI?.promptAPI?.available
      });

      const source = capabilities?.chromeAI?.promptAPI?.available ? 'on-device' : 'cloud';

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        content: (response as any).text || (response as any).response || response.toString() || 'I apologize, but I was unable to generate a response.',
        role: 'assistant',
        timestamp: Date.now(),
        source,
        ...(contextText && { context: contextText })
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Persist to store and IDB (best-effort)
      try {
        addChatMessage(userMessage.content, assistantMessage.content, source);
        await truthLensCache.storeChatMessage(
          userMessage.content,
          assistantMessage.content,
          source,
          contextText || undefined
        );
      } catch (e) {
        console.debug('[TruthLens Chat] Failed to persist chat message:', e);
      }

      // Clear context after successful response
      if (contextText) {
        setContextText(null);
      }
    } catch (error) {
      console.error('[TruthLens Chat] Error sending message:', error);

      // Show error message to user
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        content: 'I apologize, but I encountered an error while processing your request. Please try again.',
        role: 'assistant',
        timestamp: Date.now(),
        source: 'cloud' as const
      };

      setMessages(prev => [...prev, errorMessage]);
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
        <div className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full shadow-sm">
          <MessageCircle className="w-10 h-10 text-blue-600" />
        </div>

        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold text-foreground">Ask the Analyst</h3>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Chat with our AI analyst for research help, fact verification, and analysis.
            Uses on-device AI when available with cloud fallback.
          </p>
        </div>

        <div className="w-full max-w-md space-y-4">
          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={() => setInputValue("What are the key facts about this topic?")}
              variant="outline"
              className="justify-start h-auto p-3 text-left hover:bg-blue-50 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Lightbulb className="w-4 h-4 text-blue-600" />
                <span className="text-sm">Suggest key facts</span>
              </div>
            </Button>

            <Button
              onClick={() => setInputValue("Can you verify this information?")}
              variant="outline"
              className="justify-start h-auto p-3 text-left hover:bg-green-50 hover:border-green-200 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-green-600" />
                <span className="text-sm">Verify information</span>
              </div>
            </Button>
          </div>

          {/* Input Area */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Ask a question..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-4 py-3 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Or select text and use: <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Alt+Shift+A</kbd>
            </p>
          </div>
        </div>

        {!capabilities?.chromeAI?.promptAPI?.available && (
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
