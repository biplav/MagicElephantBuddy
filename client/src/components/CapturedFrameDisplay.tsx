
import React from 'react';

interface CapturedFrameDisplayProps {
  frameData: string | null;
  className?: string;
  title?: string;
}

export function CapturedFrameDisplay({ frameData, className = "", title }: CapturedFrameDisplayProps) {
  const [imageError, setImageError] = React.useState(false);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('Failed to load frame image:', frameData);
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageError(false);
  };

  return (
    <div className={`bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      {title && (
        <div className="bg-gray-800 text-white text-xs px-2 py-1 font-medium">
          {title}
        </div>
      )}
      <div className="w-full h-full min-h-[120px] flex items-center justify-center">
        {frameData && !imageError ? (
          <img 
            src={frameData.startsWith('data:') ? frameData : 
                 frameData.startsWith('/api/') ? frameData : 
                 `data:image/jpeg;base64,${frameData}`}
            alt="Captured frame"
            className="w-full h-full object-contain"
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        ) : (
          <div className="text-gray-500 text-sm p-4 text-center">
            {frameData ? 'Failed to load image' : 'No frame captured'}
          </div>
        )}
      </div>
    </div>
  );
}
