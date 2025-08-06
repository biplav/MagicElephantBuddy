import { motion } from "framer-motion";
import { FC } from "react";
import SoundWave from "./SoundWave";

export type ElephantState = "idle" | "listening" | "thinking" | "speaking" | "error" | "rateLimit" | "network" | "auth" | "serviceUnavailable";

interface ElephantProps {
  state: ElephantState;
  speechText?: string;
}

const Elephant: FC<ElephantProps> = ({ state, speechText }) => {
  // Animated SVG elephant component
  const AnimatedElephantSVG: FC<{ isAnimated?: boolean }> = ({ isAnimated = false }) => (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <path d="M388 160C388 160 408 140 428 140C448 140 468 160 468 180C468 200 448 220 428 220C408 220 388 200 388 180" fill="#9D78C9"/>
      <path d="M124 160C124 160 104 140 84 140C64 140 44 160 44 180C44 200 64 220 84 220C104 220 124 200 124 180" fill="#9D78C9"/>
      
      {/* Body */}
      <ellipse cx="256" cy="280" rx="160" ry="140" fill="#9D78C9"/>
      
      {/* Eyes */}
      <circle cx="216" cy="250" r="15" fill="white"/>
      <circle cx="217" cy="250" r="5" fill="black"/>
      <circle cx="296" cy="250" r="15" fill="white"/>
      <circle cx="297" cy="250" r="5" fill="black"/>
      
      {/* Animated mouth - changes shape when speaking */}
      <motion.path 
        d="M236 300C236 300 256 320 276 300"
        stroke="black" 
        strokeWidth="4" 
        strokeLinecap="round"
        animate={isAnimated ? {
          d: [
            "M236 300C236 300 256 320 276 300",
            "M236 300C236 300 256 315 276 300",
            "M236 300C236 300 256 325 276 300",
            "M236 300C236 300 256 315 276 300"
          ]
        } : {}}
        transition={isAnimated ? {
          duration: 0.4,
          repeat: Infinity,
          ease: "easeInOut"
        } : {}}
      />
      
      {/* Trunk */}
      <path d="M256 330C256 330 256 380 216 400" stroke="#9D78C9" strokeWidth="20" strokeLinecap="round"/>
      <path d="M243 370H269" stroke="black" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  );

  const renderElephant = () => {
    switch (state) {
      case "idle":
        return (
          <motion.div
            className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 mx-auto"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            <AnimatedElephantSVG isAnimated={false} />
          </motion.div>
        );
      
      case "listening":
        return (
          <div className="relative">
            <motion.div
              className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 mx-auto"
              animate={{ rotate: [-2, 2, -2] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <AnimatedElephantSVG isAnimated={false} />
            </motion.div>
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
              <SoundWave />
            </div>
          </div>
        );
      
      case "thinking":
        return (
          <div className="relative">
            <motion.div 
              className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 mx-auto"
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <AnimatedElephantSVG isAnimated={false} />
            </motion.div>
            
            {/* Thinking animation - enhanced version */}
            <div className="absolute top-0 left-0 right-0 flex justify-center">
              <motion.div 
                className="mt-4 sm:mt-6 md:mt-8 px-3 py-2 sm:px-4 sm:py-2 md:px-5 md:py-3 bg-white rounded-full shadow-lg border-2 border-primary"
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex space-x-1 sm:space-x-2">
                  <motion.div
                    className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-primary rounded-full"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                  />
                  <motion.div
                    className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-primary rounded-full"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-primary rounded-full"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                  />
                </div>
              </motion.div>
            </div>
          </div>
        );
      
      case "speaking":
        return (
          <motion.div
            className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 mx-auto"
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
          >
            <AnimatedElephantSVG isAnimated={true} />
          </motion.div>
        );
      
      // Error states - show sad/confused elephant
      case "error":
      case "rateLimit":
      case "network":
      case "auth":
      case "serviceUnavailable":
        return (
          <div className="relative">
            <motion.div
              className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 mx-auto"
              animate={{ rotate: [-1, 1, -1] }}
              transition={{ repeat: Infinity, duration: 4 }}
            >
              <AnimatedElephantSVG isAnimated={false} />
            </motion.div>
            <div className="absolute top-0 left-0 right-0 flex justify-center">
              <motion.div 
                className="mt-4 sm:mt-6 md:mt-8 px-3 py-2 sm:px-4 sm:py-2 md:px-5 md:py-3 bg-white rounded-full shadow-lg border-2 border-red-400"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-red-500 font-bold text-sm sm:text-base md:text-lg">
                  !
                </div>
              </motion.div>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 mx-auto">
            <AnimatedElephantSVG isAnimated={false} />
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative w-full">
      {renderElephant()}
      
      {speechText && (
        <motion.div 
          className="w-11/12 sm:w-4/5 bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 mt-2 sm:mt-4 shadow-lg relative mx-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute -top-2 sm:-top-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 sm:border-l-6 sm:border-r-6 sm:border-b-6 border-white border-l-transparent border-r-transparent"></div>
          <p className="text-primary font-medium text-sm sm:text-base md:text-lg text-center leading-relaxed">{speechText}</p>
        </motion.div>
      )}
    </div>
  );
};

export default Elephant;
export { Elephant };
