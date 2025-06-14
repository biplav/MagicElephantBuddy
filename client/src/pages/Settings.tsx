import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Settings as SettingsIcon, Brain, Mic, Volume2, Save, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

interface AIProviderSettings {
  defaultProvider: string;
  voiceMode: 'openai' | 'gemini';
  creativeMode: boolean;
  voicePreference: string;
}

const AI_CONFIGURATIONS = {
  // OpenAI Configurations
  standard: {
    name: 'OpenAI Standard',
    description: 'GPT-4o with balanced performance',
    provider: 'OpenAI'
  },
  fast: {
    name: 'OpenAI Fast',
    description: 'GPT-4o-mini for quick responses',
    provider: 'OpenAI'
  },
  creative: {
    name: 'OpenAI Creative',
    description: 'GPT-4o optimized for storytelling',
    provider: 'OpenAI'
  },
  // Gemini Configurations
  geminiStandard: {
    name: 'Gemini Standard',
    description: 'Gemini 2.0-flash-exp with balanced performance',
    provider: 'Google'
  },
  geminiFast: {
    name: 'Gemini Fast',
    description: 'Gemini 1.5-flash for quick responses',
    provider: 'Google'
  },
  geminiLive: {
    name: 'Gemini Live',
    description: 'Gemini 2.0-flash-exp with Live API support',
    provider: 'Google'
  }
};

const VOICE_OPTIONS = [
  { value: 'nova', label: 'Nova (Child-friendly)', description: 'Warm and engaging voice' },
  { value: 'fable', label: 'Fable (Storytelling)', description: 'Perfect for stories and adventures' },
  { value: 'alloy', label: 'Alloy (Neutral)', description: 'Clear and balanced voice' },
  { value: 'echo', label: 'Echo (Expressive)', description: 'Animated and lively voice' }
];

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AIProviderSettings>({
    defaultProvider: 'standard',
    voiceMode: 'openai',
    creativeMode: false,
    voicePreference: 'nova'
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('appuAISettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Auto-update voice processing mode based on AI provider selection
  const handleProviderChange = (value: string) => {
    const newSettings = { ...settings, defaultProvider: value };
    
    // Auto-select voice processing based on provider
    if (value.startsWith('gemini')) {
      newSettings.voiceMode = 'gemini';
    } else {
      newSettings.voiceMode = 'openai';
    }
    
    setSettings(newSettings);
  };

  const handleSaveSettings = async () => {
    setIsLoading(true);
    
    try {
      // Save settings to localStorage
      localStorage.setItem('appuAISettings', JSON.stringify(settings));
      
      // Test the selected configuration
      const testResponse = await fetch('/api/process-with-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello Appu! Testing my new settings.',
          aiConfig: settings.defaultProvider,
          useCreative: settings.creativeMode
        }),
      });
      
      if (testResponse.ok) {
        toast({
          title: "Settings Saved Successfully",
          description: "Your AI provider preferences have been updated and tested.",
        });
      } else {
        throw new Error('Failed to test configuration');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error Saving Settings",
        description: "There was an issue saving your preferences. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedConfig = AI_CONFIGURATIONS[settings.defaultProvider as keyof typeof AI_CONFIGURATIONS];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/">
            <Button 
              variant="ghost" 
              size="sm" 
              className="mr-2 p-2 rounded-full hover:bg-white/80"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-5 h-5 text-purple-600" />
            </Button>
          </Link>
          <div className="p-3 bg-white rounded-full shadow-lg">
            <SettingsIcon className="w-8 h-8 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
            <p className="text-gray-600">Configure your Appu experience</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* AI Provider Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                AI Provider Configuration
              </CardTitle>
              <CardDescription>
                Choose which AI provider and model configuration Appu should use for conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider Selection */}
              <div className="space-y-3">
                <Label htmlFor="provider">Default AI Configuration</Label>
                <Select
                  value={settings.defaultProvider}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select AI configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="text-sm font-medium text-gray-500 px-2 py-1">OpenAI Models</div>
                    {Object.entries(AI_CONFIGURATIONS)
                      .filter(([_, config]) => config.provider === 'OpenAI')
                      .map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span className="font-medium">{config.name}</span>
                            <span className="text-sm text-gray-500">{config.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    <Separator className="my-2" />
                    <div className="text-sm font-medium text-gray-500 px-2 py-1">Google Gemini Models</div>
                    {Object.entries(AI_CONFIGURATIONS)
                      .filter(([_, config]) => config.provider === 'Google')
                      .map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span className="font-medium">{config.name}</span>
                            <span className="text-sm text-gray-500">{config.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                
                {selectedConfig && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-blue-900">{selectedConfig.name}</p>
                        <p className="text-sm text-blue-700">{selectedConfig.description}</p>
                      </div>
                      <div className="px-2 py-1 bg-blue-100 rounded text-xs font-medium text-blue-800">
                        {selectedConfig.provider}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Creative Mode Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="creative-mode">Creative Mode</Label>
                  <p className="text-sm text-gray-500">
                    Enable enhanced creativity for storytelling and imaginative conversations
                  </p>
                </div>
                <Switch
                  id="creative-mode"
                  checked={settings.creativeMode}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, creativeMode: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Voice Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-purple-600" />
                Voice Settings
              </CardTitle>
              <CardDescription>
                Customize Appu's voice and audio preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Voice Selection */}
              <div className="space-y-3">
                <Label htmlFor="voice">Voice Preference</Label>
                <Select
                  value={settings.voicePreference}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, voicePreference: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((voice) => (
                      <SelectItem key={voice.value} value={voice.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{voice.label}</span>
                          <span className="text-sm text-gray-500">{voice.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Voice Mode - Auto-selected based on AI provider */}
              <div className="space-y-3">
                <Label htmlFor="voice-mode">Voice Processing</Label>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {settings.voiceMode === 'gemini' ? 'Gemini Live Voice' : 'OpenAI Voice Processing'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {settings.voiceMode === 'gemini' 
                          ? 'Real-time voice processing with Gemini Live API' 
                          : 'Traditional audio processing with Whisper + TTS'}
                      </p>
                    </div>
                    <div className="px-2 py-1 bg-blue-100 rounded text-xs font-medium text-blue-800">
                      Auto-selected
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Voice processing mode is automatically selected based on your AI provider choice.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSaveSettings}
              disabled={isLoading}
              size="lg"
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}