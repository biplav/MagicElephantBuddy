/**
 * This file contains the structure for child profiles
 * In a production environment, this would be loaded from a database
 * For now, we use a placeholder that can be extended in the future
 */

export interface ChildProfile {
  name: string;
  age: number;
  likes: string[];
  dislikes: string[];
  favoriteThings: {
    colors: string[];
    animals: string[];
    activities: string[];
    foods: string[];
    characters: string[];
  };
  learningGoals: string[];
  preferredLanguages: string[];
  dailyRoutine: {
    wakeUpTime: string;
    bedTime: string;
    mealtimes: string[];
    napTime: string;
  };
}

// A placeholder profile to use when developing
// This would be replaced with real data in production
export const DEFAULT_PROFILE: ChildProfile = {
  name: "Buddy",
  age: 4,
  likes: ["dinosaurs", "drawing", "music", "stories"],
  dislikes: ["loud noises", "dark rooms"],
  favoriteThings: {
    colors: ["blue", "green"],
    animals: ["elephant", "tiger", "giraffe"],
    activities: ["dancing", "coloring", "playing with blocks"],
    foods: ["apples", "pasta", "ice cream"],
    characters: ["Appu", "Chhota Bheem", "Motu Patlu"]
  },
  learningGoals: ["counting to 20", "alphabet", "colors", "shapes"],
  preferredLanguages: ["Hindi", "English"],
  dailyRoutine: {
    wakeUpTime: "7:00 AM",
    bedTime: "8:30 PM",
    mealtimes: ["8:00 AM", "12:00 PM", "4:00 PM", "7:00 PM"],
    napTime: "1:00 PM"
  }
};

// Time of day context for contextual responses
export interface TimeOfDayContext {
  currentTime: string;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  upcomingActivity?: string;
  childMood?: string;
}

// Default time of day context
export const DEFAULT_TIME_CONTEXT: TimeOfDayContext = {
  currentTime: new Date().toLocaleTimeString(),
  timeOfDay: "afternoon", // Default
  upcomingActivity: "playtime"
};

// Helper function to get appropriate time of day
export function getTimeOfDay(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

// Update time context based on current time
export function getCurrentTimeContext(): TimeOfDayContext {
  const now = new Date();
  const hour = now.getHours();
  
  const timeOfDay = getTimeOfDay(hour);
  
  let upcomingActivity = "playtime";
  if (timeOfDay === "morning") upcomingActivity = "learning time";
  if (timeOfDay === "afternoon") upcomingActivity = "nap time";
  if (timeOfDay === "evening") upcomingActivity = "dinner time";
  if (timeOfDay === "night") upcomingActivity = "bedtime";
  
  return {
    currentTime: now.toLocaleTimeString(),
    timeOfDay,
    upcomingActivity
  };
}