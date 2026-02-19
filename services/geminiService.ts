
import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

if (process.env.API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

const FALLBACK_MESSAGES = [
  "Price discovery active.",
  "Numerical adjustment in progress.",
  "Threshold monitoring active.",
  "System parameters updating.",
  "Technical evaluation of current floor.",
  "Flow monitoring engaged.",
  "Final value pending participant action.",
  "Verification of entry active.",
  "Standard value update recorded.",
  "Sequence stabilizing."
];

let isRateLimited = false;
let cooldownResetTime = 0;

export const generateAuctionCommentary = async (
  currentPrice: number,
  isStart: boolean = false,
  isEnd: boolean = false,
  winnerName?: string
): Promise<string> => {
  if (!ai) return "";

  if (isRateLimited) {
    if (Date.now() < cooldownResetTime) {
      return Math.random() < 0.4 ? FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)] : "";
    } else {
      isRateLimited = false;
    }
  }

  try {
    let prompt = "";
    if (isStart) {
      prompt = `A reverse price auction is starting. Initial value is $${currentPrice}. Generate a neutral, professional system statement acknowledging the start of the sequence. Do not use exclamation points. Focus on the mechanism and participation.`;
    } else if (isEnd && winnerName) {
      prompt = `The auction has ended. Participant ${winnerName} accepted at $${currentPrice}. Generate a neutral confirmation that the process is complete. Do not use exclamation points. Focus on completion and finality.`;
    } else {
      prompt = `The value has updated to $${currentPrice}. Generate a brief, neutral technical observation regarding the current number or trajectory. Do not use exclamation points. Keep it under 15 words.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "";
  } catch (error: any) {
    console.error("Gemini commentary failed:", error);
    
    const is429 = 
      error?.status === 429 || 
      (error?.message && error.message.includes('429')) ||
      (error?.message && error.message.includes('RESOURCE_EXHAUSTED'));

    if (is429) {
      isRateLimited = true;
      cooldownResetTime = Date.now() + 60000;
      return FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
    }
    
    return "";
  }
};
