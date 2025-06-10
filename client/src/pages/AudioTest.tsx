import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Play, Pause } from 'lucide-react';

export default function AudioTest() {
  const [inputText, setInputText] = useState("Hello! Main Appu hoon, tumhara magical elephant dost! Namaste!");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const generateAudio = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/process-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: inputText }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.audioBase64) {
          // Create a blob URL from the base64 audio
          const audioBlob = base64ToBlob(data.audioBase64, 'audio/wav');
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);
        }
      } else {
        console.error('Failed to generate audio');
      }
    } catch (error) {
      console.error('Error generating audio:', error);
    }
    setIsGenerating(false);
  };

  const base64ToBlob = (base64: string, contentType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  };

  const playAudio = () => {
    if (audioUrl) {
      if (audioElement) {
        audioElement.pause();
        setAudioElement(null);
        setIsPlaying(false);
      } else {
        const audio = new Audio(audioUrl);
        audio.play();
        setAudioElement(audio);
        setIsPlaying(true);
        
        audio.onended = () => {
          setIsPlaying(false);
          setAudioElement(null);
        };
      }
    }
  };

  const downloadAudio = () => {
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `appu-speech-${Date.now()}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-yellow-100 p-4">
      <div className="max-w-2xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-purple-800">
              🐘 Appu Audio Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Enter text for Appu to speak:
              </label>
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your text here..."
                className="w-full"
              />
            </div>
            
            <Button 
              onClick={generateAudio} 
              disabled={isGenerating || !inputText.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isGenerating ? 'Generating Audio...' : 'Generate Appu Audio'}
            </Button>

            {audioUrl && (
              <div className="space-y-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-green-800 font-medium">Audio Generated Successfully!</p>
                
                <div className="flex gap-3">
                  <Button
                    onClick={playAudio}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  
                  <Button
                    onClick={downloadAudio}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <Download size={16} />
                    Download Audio
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sample Texts to Try:</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                "Hello! Main Appu hoon, tumhara magical elephant dost! Namaste!",
                "Chalo bachon, aaj hum kuch naya seekhte hain! Ready ho?",
                "Sone ka time ho gaya hai, sweet dreams!",
                "Kya tumhe kahani sunni hai? Main tumhe ek magical story sunata hoon!"
              ].map((text, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="w-full text-left justify-start h-auto py-3 px-4"
                  onClick={() => setInputText(text)}
                >
                  "{text}"
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}