
import React from 'react';

interface CapturedFrameDisplayProps {
  frameData: string | null;
  className?: string;
  title?: string;
}

export function CapturedFrameDisplay({ frameData, className = "", title }: CapturedFrameDisplayProps) {
  return (
    <div className={`bg-black rounded-lg overflow-hidden ${className}`}>
      {title && (
        <div className="bg-gray-800 text-white text-xs px-2 py-1 font-medium">
          {title}
        </div>
      )}
      <div className="w-full h-full min-h-[120px] flex items-center justify-center">
        {frameData ? (
          <img 
            src={`data:image/jpeg;base64,${frameData}`}
            alt="Captured frame"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-500 text-sm">No frame captured</div>
        )}
      </div>
    </div>
  );
}
