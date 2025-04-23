import { motion } from "framer-motion";

const SoundWave = () => {
  return (
    <div className="flex items-center justify-center gap-[3px]">
      {[0.1, 0.2, 0.3, 0.4, 0.5].map((delay, index) => (
        <motion.div
          key={index}
          className="w-[6px] bg-primary rounded-[5px]"
          animate={{ height: ["5px", "20px", "5px"] }}
          transition={{
            repeat: Infinity,
            duration: 1,
            delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

export default SoundWave;
