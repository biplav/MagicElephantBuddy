
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SilenceTestControlsProps {
  silenceDetection: {
    isDetectingSilence: boolean;
    isSilent: boolean;
    silenceTimer: number;
    isEnabled: boolean;
    setAppuSpeaking: (speaking: boolean) => void;
    setUserSpeaking: (speaking: boolean) => void;
    setEnabled: (enabled: boolean) => void;
    interruptSilence: () => void;
  };
}

export default function SilenceTestControls({ silenceDetection }: SilenceTestControlsProps) {
  const [appuSpeaking, setAppuSpeaking] = React.useState(false);
  const [userSpeaking, setUserSpeaking] = React.useState(false);

  const toggleAppuSpeaking = () => {
    const newState = !appuSpeaking;
    setAppuSpeaking(newState);
    silenceDetection.setAppuSpeaking(newState);
    console.log('🤖 APPU SPEAKING TEST:', newState);
  };

  const toggleUserSpeaking = () => {
    const newState = !userSpeaking;
    setUserSpeaking(newState);
    silenceDetection.setUserSpeaking(newState);
    console.log('👤 USER SPEAKING TEST:', newState);
  };

  const triggerSilence = () => {
    setAppuSpeaking(false);
    setUserSpeaking(false);
    silenceDetection.setAppuSpeaking(false);
    silenceDetection.setUserSpeaking(false);
    console.log('🔇 SILENCE TEST: Both stopped speaking');
  };

  const interruptSilence = () => {
    silenceDetection.interruptSilence();
    console.log('⏹️ INTERRUPT TEST: Manually interrupted silence');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-sm">🧪 Silence Detection Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 text-xs">
          <Badge variant={silenceDetection.isEnabled ? "default" : "secondary"}>
            {silenceDetection.isEnabled ? "Enabled" : "Disabled"}
          </Badge>
          <Badge variant={silenceDetection.isSilent ? "outline" : "default"}>
            {silenceDetection.isSilent ? "Silent" : "Speaking"}
          </Badge>
          <Badge variant={silenceDetection.isDetectingSilence ? "destructive" : "secondary"}>
            {silenceDetection.isDetectingSilence ? `${Math.ceil(silenceDetection.silenceTimer / 1000)}s` : "No Timer"}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button 
            size="sm" 
            variant={appuSpeaking ? "default" : "outline"}
            onClick={toggleAppuSpeaking}
          >
            🤖 Appu {appuSpeaking ? "Stop" : "Speak"}
          </Button>
          <Button 
            size="sm" 
            variant={userSpeaking ? "default" : "outline"}
            onClick={toggleUserSpeaking}
          >
            👤 User {userSpeaking ? "Stop" : "Speak"}
          </Button>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={triggerSilence}>
            🔇 Trigger Silence
          </Button>
          <Button size="sm" variant="destructive" onClick={interruptSilence}>
            ⏹️ Interrupt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
