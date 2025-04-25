import { motion } from "framer-motion";
import { FC } from "react";
import SoundWave from "./SoundWave";

export type ElephantState = "idle" | "listening" | "thinking" | "speaking" | "error" | "rateLimit" | "network" | "auth" | "serviceUnavailable";

interface ElephantProps {
  state: ElephantState;
  speechText?: string;
}

const Elephant: FC<ElephantProps> = ({ state, speechText }) => {
  const elephantSvg = `
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M388 160C388 160 408 140 428 140C448 140 468 160 468 180C468 200 448 220 428 220C408 220 388 200 388 180" fill="#9D78C9"/>
      <path d="M124 160C124 160 104 140 84 140C64 140 44 160 44 180C44 200 64 220 84 220C104 220 124 200 124 180" fill="#9D78C9"/>
      <ellipse cx="256" cy="280" rx="160" ry="140" fill="#9D78C9"/>
      <circle cx="216" cy="250" r="15" fill="white"/>
      <circle cx="217" cy="250" r="5" fill="black"/>
      <circle cx="296" cy="250" r="15" fill="white"/>
      <circle cx="297" cy="250" r="5" fill="black"/>
      <path d="M236 300C236 300 256 320 276 300" stroke="black" stroke-width="4" stroke-linecap="round"/>
      <path d="M256 330C256 330 256 380 216 400" stroke="#9D78C9" stroke-width="20" stroke-linecap="round"/>
      <path d="M243 370H269" stroke="black" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `;

  const renderElephant = () => {
    switch (state) {
      case "idle":
        return (
          <motion.div
            className="w-72 h-72 mx-auto"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
            dangerouslySetInnerHTML={{ __html: elephantSvg }}
          />
        );
      
      case "listening":
        return (
          <div className="relative">
            <motion.div
              className="w-72 h-72 mx-auto"
              animate={{ rotate: [-2, 2, -2] }}
              transition={{ repeat: Infinity, duration: 1 }}
              dangerouslySetInnerHTML={{ __html: elephantSvg }}
            />
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
              <SoundWave />
            </div>
          </div>
        );
      
      case "thinking":
        return (
          <div className="relative">
            <motion.div 
              className="w-72 h-72 mx-auto"
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              dangerouslySetInnerHTML={{ __html: elephantSvg }} 
            />
            
            {/* Thinking animation - enhanced version */}
            <div className="absolute top-0 left-0 right-0 flex justify-center">
              <motion.div 
                className="mt-8 px-5 py-3 bg-white rounded-full shadow-lg border-2 border-primary"
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex space-x-2">
                  <motion.div
                    className="w-4 h-4 bg-primary rounded-full"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                  />
                  <motion.div
                    className="w-4 h-4 bg-primary rounded-full"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-4 h-4 bg-primary rounded-full"
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
            className="w-72 h-72 mx-auto"
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
            dangerouslySetInnerHTML={{ __html: elephantSvg }}
          />
        );
      
      default:
        return (
          <div className="w-72 h-72 mx-auto" dangerouslySetInnerHTML={{ __html: elephantSvg }} />
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative w-full">
      {renderElephant()}
      
      {speechText && (
        <motion.div 
          className="w-4/5 bg-white rounded-2xl p-4 mt-4 shadow-lg relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-white border-l-transparent border-r-transparent"></div>
          <p className="text-neutral font-body text-center">{speechText}</p>
        </motion.div>
      )}
    </div>
  );
};

export default Elephant;
