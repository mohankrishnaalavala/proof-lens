import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Cloud, Cpu, Shield, Zap } from 'lucide-react';

// Local type for Firebase config saved in chrome.storage
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

interface OptionsState {
  cloudFallbackEnabled: boolean;
  feedGuardEnabled: boolean;
  telemetryEnabled: boolean;
  autoFactCheckEnabled: boolean;
}

export function Options() {
  const [options, setOptions] = useState<OptionsState>({
    cloudFallbackEnabled: false,
    feedGuardEnabled: false,
    telemetryEnabled: false,
    autoFactCheckEnabled: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig>({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });

  useEffect(() => {
    // Load saved options
    chrome.storage.sync.get(['truthlensOptions','factCheckApiKey','firebaseConfig','cloudFallbackEnabled'], (result) => {
      if (result['truthlensOptions']) {
        setOptions(result['truthlensOptions']);
      }
      if (typeof result['cloudFallbackEnabled'] === 'boolean') {
        setOptions(prev => ({ ...prev, cloudFallbackEnabled: result['cloudFallbackEnabled'] }));
      }
      if (typeof result['factCheckApiKey'] === 'string') {
        setApiKey(result['factCheckApiKey']);
      }
      if (result['firebaseConfig']) {
        setFirebaseConfig(result['firebaseConfig'] as FirebaseConfig);
      }
    });

    // Request capabilities
    chrome.runtime.sendMessage({
      type: 'TL_REQUEST_CAPABILITIES',
      timestamp: Date.now()
    }).then((response) => {
      if (response?.data) {
        setCapabilities(response.data);
      }
    }).catch(console.error);
  }, []);

  const handleOptionChange = async (key: keyof OptionsState, value: boolean) => {
    const newOptions = { ...options, [key]: value };
    setOptions(newOptions);

    setIsSaving(true);

    try {
      // Keep both the structured options blob and a top-level flag for fast access in adapters
      const toSave: Record<string, unknown> = { truthlensOptions: newOptions };
      if (key === 'cloudFallbackEnabled') {
        toSave['cloudFallbackEnabled'] = value;
      }
      await chrome.storage.sync.set(toSave);

      // Notify service worker of changes
      chrome.runtime.sendMessage({
        type: 'TL_OPTIONS_UPDATED',
        payload: { options: newOptions },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error saving options:', error);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const resetToDefaults = async () => {
    const defaultOptions: OptionsState = {
      cloudFallbackEnabled: false,
      feedGuardEnabled: false,
      telemetryEnabled: false,
      autoFactCheckEnabled: false
    };

    setOptions(defaultOptions);
    setApiKey('');

    try {
      await chrome.storage.sync.set({ truthlensOptions: defaultOptions, factCheckApiKey: '' });
      chrome.runtime.sendMessage({
        type: 'TL_OPTIONS_UPDATED',
        payload: { options: defaultOptions },
        timestamp: Date.now()
      });
      chrome.runtime.sendMessage({
        type: 'TL_FACTCHECK_KEY_UPDATED',
        payload: { apiKey: '' },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error resetting options:', error);
    }
  };

  const hasOnDeviceAI = capabilities?.promptAPI?.available || capabilities?.summarizerAPI?.available;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-lg text-lg font-bold mx-auto">
          TL
        </div>
        <h1 className="text-2xl font-bold">TruthLens Options</h1>
        <p className="text-muted-foreground">Configure your fact-checking and analysis preferences</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs text-muted-foreground">Cloud Fallback:</span>
        <Badge variant={options.cloudFallbackEnabled ? 'source-cloud' : 'secondary'} className="text-xs">
          {options.cloudFallbackEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>


      {/* AI Capabilities Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            AI Capabilities
          </CardTitle>
          <CardDescription>
            Current status of on-device and cloud AI features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Prompt API</span>
                <Badge variant={capabilities?.promptAPI?.available ? 'source-ondevice' : 'secondary'}>
                  {capabilities?.promptAPI?.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Summarizer API</span>
                <Badge variant={capabilities?.summarizerAPI?.available ? 'source-ondevice' : 'secondary'}>
                  {capabilities?.summarizerAPI?.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
            </div>
      {/* Cloud Fallback (Firebase) Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            Cloud Fallback (Firebase)
          </CardTitle>
          <CardDescription>
            Provide your Firebase project details so TruthLens can use cloud AI when on-device models are unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Project ID</span>
              <input
                className="border rounded px-3 py-2 bg-background"
                placeholder="your-project-id"
                value={firebaseConfig.projectId}
                onChange={(e) => setFirebaseConfig({ ...firebaseConfig, projectId: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">API Key</span>
              <input
                className="border rounded px-3 py-2 bg-background"
                placeholder="AIza..."
                value={firebaseConfig.apiKey}
                onChange={(e) => setFirebaseConfig({ ...firebaseConfig, apiKey: e.target.value })}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                // Clear config
                setFirebaseConfig({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' });
                await chrome.storage.sync.set({ firebaseConfig: { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' } });
              }}
            >
              Clear
            </Button>
            <Button
              onClick={async () => {
                setIsSaving(true);
                try {
                  const cfg: FirebaseConfig = {
                    ...firebaseConfig,
                    // Safe defaults for unused fields
                    authDomain: firebaseConfig.authDomain || `${firebaseConfig.projectId}.firebaseapp.com`,
                    storageBucket: firebaseConfig.storageBucket || `${firebaseConfig.projectId}.appspot.com`,
                    messagingSenderId: firebaseConfig.messagingSenderId || '',
                    appId: firebaseConfig.appId || ''
                  };
                  await chrome.storage.sync.set({ firebaseConfig: cfg, cloudFallbackEnabled: options.cloudFallbackEnabled });
                  // Optional: notify runtime for immediate uptake
                  chrome.runtime.sendMessage({ type: 'TL_FIREBASE_CONFIG_UPDATED', timestamp: Date.now() }).catch(() => {});
                } catch (error) {
                  console.error('Error saving Firebase config:', error);
                } finally {
                  setTimeout(() => setIsSaving(false), 500);
                }
              }}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Writer API</span>
                <Badge variant={capabilities?.writerAPI?.available ? 'source-ondevice' : 'secondary'}>
                  {capabilities?.writerAPI?.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Rewriter API</span>
                <Badge variant={capabilities?.rewriterAPI?.available ? 'source-ondevice' : 'secondary'}>
                  {capabilities?.rewriterAPI?.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Core Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            AI Processing
          </CardTitle>
          <CardDescription>
            Configure how TruthLens processes your requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Cloud Fallback</span>
                {!hasOnDeviceAI && <Badge variant="outline" className="text-xs">Recommended</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                Use cloud AI when on-device models are unavailable. Responses will be clearly marked.
              </p>
            </div>
            <Switch
              checked={options.cloudFallbackEnabled}
              onCheckedChange={(checked: boolean) => handleOptionChange('cloudFallbackEnabled', checked)}
            />
          </div>

          {!hasOnDeviceAI && !options.cloudFallbackEnabled && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-orange-800">Limited functionality</p>
                <p className="text-orange-700">
                  Without on-device AI or cloud fallback, fact-checking and analysis features will be limited.
                </p>
              </div>
            </div>
          )}

          {/* Fact Check Tools API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Google Fact Check Tools API Key</label>
            <input
              className="w-full px-3 py-2 border rounded-md text-sm"
              type="password"
              value={apiKey}
              placeholder="Paste your API key"
              onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await chrome.storage.sync.set({ factCheckApiKey: apiKey });
                    chrome.runtime.sendMessage({
                      type: 'TL_FACTCHECK_KEY_UPDATED',
                      payload: { apiKey },
                      timestamp: Date.now()
                    });
                  } catch (error) {
                    console.error('Error saving API key:', error);
                  }
                }}
              >
                Save API Key
              </Button>
              {apiKey && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open('https://console.cloud.google.com/apis/library/factchecktools.googleapis.com', '_blank')}
                >
                  Get/Manage Key
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Experimental Features */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Experimental Features
          </CardTitle>
          <CardDescription>
            Early access features that may change or be removed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Feed Guard</span>
                <Badge variant="outline" className="text-xs">Beta</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Add fact-check buttons to social media posts (Twitter, Facebook, Reddit)
              </p>
            </div>
            <Switch
              checked={options.feedGuardEnabled}
              onCheckedChange={(checked: boolean) => handleOptionChange('feedGuardEnabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="font-medium">Auto Fact-Check</span>
              <p className="text-sm text-muted-foreground">
                Automatically analyze claims as you browse (requires Feed Guard)
              </p>
            </div>
            <Switch
              checked={options.autoFactCheckEnabled}
              onCheckedChange={(checked: boolean) => handleOptionChange('autoFactCheckEnabled', checked)}
              disabled={!options.feedGuardEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Privacy & Data
          </CardTitle>
          <CardDescription>
            Control what data is collected and how it's used
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="font-medium">Anonymous Telemetry</span>
              <p className="text-sm text-muted-foreground">
                Help improve TruthLens by sharing anonymous usage statistics
              </p>
            </div>
            <Switch
              checked={options.telemetryEnabled}
              onCheckedChange={(checked: boolean) => handleOptionChange('telemetryEnabled', checked)}
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm">
              <p className="font-medium text-blue-800 mb-1">Privacy First</p>
              <p className="text-blue-700">
                TruthLens processes text on-device when possible. Cloud processing is clearly marked
                and only used when explicitly enabled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={resetToDefaults}>
          Reset to Defaults
        </Button>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-sm text-muted-foreground">Saving...</span>
          )}
          <Badge variant="outline" className="text-xs">
            Auto-saved
          </Badge>
        </div>
      </div>
    </div>
  );
}
