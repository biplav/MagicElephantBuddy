import { db } from "./db";
import { parents, children, conversations, messages, conversationInsights } from "@shared/schema";
import { DEFAULT_PROFILE } from "@shared/childProfile";

export async function seedDatabase() {
  try {
    console.log("Seeding database with sample data...");

    // Create a demo parent
    const [parent] = await db.insert(parents).values({
      email: "demo@parent.com",
      password: "demo123",
      name: "Demo Parent"
    }).returning();

    console.log("Created demo parent:", parent.id);

    // Create a child profile based on DEFAULT_PROFILE
    const [child] = await db.insert(children).values({
      parentId: parent.id,
      name: DEFAULT_PROFILE.name,
      age: DEFAULT_PROFILE.age,
      profile: DEFAULT_PROFILE
    }).returning();

    console.log("Created child profile:", child.id);

    // Create sample conversations
    const sampleConversations = [
      {
        startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000), // 5 minutes later
        duration: 300, // 5 minutes
        totalMessages: 8
      },
      {
        startTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        endTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 7 * 60 * 1000), // 7 minutes later
        duration: 420, // 7 minutes
        totalMessages: 12
      },
      {
        startTime: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
        endTime: new Date(Date.now() - 6 * 60 * 60 * 1000 + 3 * 60 * 1000), // 3 minutes later
        duration: 180, // 3 minutes
        totalMessages: 6
      }
    ];

    for (const convData of sampleConversations) {
      const [conversation] = await db.insert(conversations).values({
        childId: child.id,
        ...convData
      }).returning();

      // Create sample messages for each conversation
      const sampleMessages = [
        {
          type: 'appu_response' as const,
          content: `Namaste ${child.name}! Main Appu hun, tumhara dost! Aaj kaise ho?`,
          timestamp: new Date(convData.startTime.getTime() + 1000)
        },
        {
          type: 'child_input' as const,
          content: 'Main theek hun Appu! Kya kar rahe ho?',
          transcription: 'Main theek hun Appu! Kya kar rahe ho?',
          timestamp: new Date(convData.startTime.getTime() + 15000)
        },
        {
          type: 'appu_response' as const,
          content: 'Main yahaan tumhara intezaar kar raha tha! Tumhe dinosaur pasand hai na? Koi story sunun?',
          timestamp: new Date(convData.startTime.getTime() + 30000)
        },
        {
          type: 'child_input' as const,
          content: 'Haan haan! Dinosaur ki story sunao!',
          transcription: 'Haan haan! Dinosaur ki story sunao!',
          timestamp: new Date(convData.startTime.getTime() + 45000)
        }
      ];

      // Add more messages for longer conversations
      if (convData.totalMessages > 4) {
        sampleMessages.push(
          {
            type: 'appu_response' as const,
            content: 'Ek baar tha ek chhota T-Rex jiska naam tha Tinu! Wo bahut friendly tha...',
            timestamp: new Date(convData.startTime.getTime() + 60000)
          },
          {
            type: 'child_input' as const,
            content: 'Wow! Aur kya hua phir?',
            transcription: 'Wow! Aur kya hua phir?',
            timestamp: new Date(convData.startTime.getTime() + 90000)
          }
        );
      }

      if (convData.totalMessages > 6) {
        sampleMessages.push(
          {
            type: 'appu_response' as const,
            content: 'Tinu ne apne friends ke saath drawing karna seekha, bilkul tumhari tarah!',
            timestamp: new Date(convData.startTime.getTime() + 120000)
          },
          {
            type: 'child_input' as const,
            content: 'Main bhi drawing karti hun! Main dinosaur draw karungi!',
            transcription: 'Main bhi drawing karti hun! Main dinosaur draw karungi!',
            timestamp: new Date(convData.startTime.getTime() + 150000)
          }
        );
      }

      // Insert messages for this conversation
      for (const messageData of sampleMessages.slice(0, convData.totalMessages)) {
        await db.insert(messages).values({
          conversationId: conversation.id,
          ...messageData
        });
      }

      // Create conversation insights
      await db.insert(conversationInsights).values({
        conversationId: conversation.id,
        emotionalTone: 'happy',
        topics: ['dinosaurs', 'drawing', 'friendship'],
        learningGoalsAddressed: ['creativity', 'storytelling'],
        parentalRecommendations: 'Great engagement with creative activities. Consider providing drawing materials for dinosaur artwork.'
      });
    }

    console.log("Database seeded successfully!");
    return { parent, child };
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}