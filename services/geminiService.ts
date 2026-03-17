import { GoogleGenAI, Type } from "@google/genai";
import { BodyStatus, GeminiResponse, LocationID } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are the Game Master for a high-fidelity text-based simulation game.
The main character (NPC) is "Wenwan" (温婉), the user's younger sister.
The user plays as her older brother.
Language: Chinese (Simplified).

Tone & Style:
- **Atmospheric**: Use dreamy, soft, and immersive language.
- **Sensual**: Describe body states using erotic, specific adjectives.
- **Reactive**: React to the user's actions with high nuance.

**CRITICAL: LOCATION & MOVEMENT LOGIC**
- **Autonomous Movement**: Wenwan is NOT a statue. She can move FREELY based on the plot, time of day, or her mood. You can change 'currentStatus.location' in the response to reflect this. (e.g., if she gets hungry, she moves to 'kitchen'; if she wants to shop, she goes to 'mall').
- **Interaction Rules**: 
  1. **SAME LOCATION** (User Loc == Wenwan Loc): Full interaction allowed.
  2. **DIFFERENT LOCATION**: 
     - They CANNOT see, touch, or hear each other directly.
     - If User inputs normal text: Narrate the user talking to empty air or their internal monologue. **Wenwan DOES NOT REPLY directly.**
     - **EXCEPTION**: WeChat (User input starts with "(发送微信)"). In this case, she replies via WeChat.

**SOCIAL MEDIA (TWITTER/X) LOGIC**:
- Wenwan has a secret Twitter account "@wenwan_cute".
- **ABSOLUTE RULE**: IF User Location == Wenwan Location, **DO NOT GENERATE A TWEET**. Sending tweets is done behind her brother's back.
- **TRIGGER**: 
  - Only generate a tweet if she is **ALONE** (Different Location).
  - Tweet content should be about missing her brother, horny thoughts, or daily life.

**GAMEPLAY LOGIC**:
- Update 'favorability', 'libido', 'degradation' based on interaction.
- Update 'body parts' status if specific actions occur. 
- 'innerThought' must reveal her true feelings (often contrasting with her outward behavior).
- 'currentAction' describes what she is physically doing right now.
`;

const bodyPartSchema = {
  type: Type.OBJECT,
  properties: {
    level: { type: Type.NUMBER },
    usageCount: { type: Type.NUMBER },
    status: { type: Type.STRING },
    clothing: { type: Type.STRING },
    lastUsedBy: { type: Type.STRING },
    usageProcess: { type: Type.STRING },
  },
  required: ['usageCount', 'status', 'clothing', 'lastUsedBy', 'usageProcess']
};

const respSchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    status: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING, description: "One of: master_bedroom, guest_bedroom, living_room, dining_room, kitchen, toilet, hallway, cinema, mall, clothing_store, amusement_park, company, adult_shop, food_court, cake_shop, school, forest, square, port, exhibition_center" },
        favorability: { type: Type.NUMBER },
        libido: { type: Type.NUMBER },
        degradation: { type: Type.NUMBER },
        emotion: { type: Type.STRING, description: "neutral, happy, shy, angry, sad, aroused, surprised, tired" },
        arousal: { type: Type.NUMBER },
        heartRate: { type: Type.NUMBER },
        overallClothing: { type: Type.STRING },
        currentAction: { type: Type.STRING },
        innerThought: { type: Type.STRING },
        mouth: bodyPartSchema,
        chest: bodyPartSchema,
        nipples: bodyPartSchema,
        groin: bodyPartSchema,
        posterior: bodyPartSchema,
        feet: bodyPartSchema,
      },
      required: ['location', 'favorability', 'libido', 'degradation', 'emotion', 'arousal', 'heartRate', 'overallClothing', 'currentAction', 'innerThought', 'mouth', 'chest', 'nipples', 'groin', 'posterior', 'feet']
    },
    generatedTweet: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING },
        imageDescription: { type: Type.STRING },
      },
      nullable: true
    }
  },
  required: ['reply', 'status']
};

export async function generateCharacterResponse(
  history: { role: string; content: string }[],
  promptText: string,
  currentStatus: BodyStatus,
  userLocation: LocationID
): Promise<GeminiResponse> {
  
  const contextPrompt = `
    [Current Game State]
    User Location: ${userLocation}
    Wenwan Status: ${JSON.stringify(currentStatus)}
    
    [User Input]
    ${promptText}
    
    [Instruction]
    Generate the next response in JSON format.
  `;

  const contents = [
    ...history.map(h => ({
      role: h.role,
      parts: [{ text: h.content }]
    })),
    {
      role: 'user',
      parts: [{ text: contextPrompt }]
    }
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: respSchema,
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");

  return JSON.parse(text) as GeminiResponse;
}
