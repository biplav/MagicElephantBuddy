
import React, { useEffect, useRef } from 'react';

interface VideoDisplayProps {
  videoElement: HTMLVideoElement | null;
  isEnabled: boolean;
  className?: string;
  title?: string;
}

export function VideoDisplay({ videoElement, isEnabled, className = "", title }: VideoDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoElement && containerRef.current && isEnabled) {
      // Clone the video element for display
      const displayVideo = videoElement.cloneNode(true) as HTMLVideoElement;
      displayVideo.srcObject = videoElement.srcObject;
      displayVideo.style.display = 'block';
      displayVideo.style.width = '100%';
      displayVideo.style.height = '100%';
      displayVideo.style.objectFit = 'cover';
      displayVideo.autoplay = true;
      displayVideo.muted = true;
      displayVideo.playsInline = true;
      
      // Clear previous content and add the video
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(displayVideo);
      
      return () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    } else if (containerRef.current) {
      containerRef.current.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Video not available</div>';
    }
  }, [videoElement, isEnabled]);

  return (
    <div className={`bg-black rounded-lg overflow-hidden ${className}`}>
      {title && (
        <div className="bg-gray-800 text-white text-xs px-2 py-1 font-medium">
          {title}
        </div>
      )}
      <div 
        ref={containerRef}
        className="w-full h-full min-h-[120px] flex items-center justify-center"
      >
        <div className="text-gray-500 text-sm">
          {isEnabled ? 'Loading video...' : 'Video disabled'}
        </div>
      </div>
    </div>
  );
}
