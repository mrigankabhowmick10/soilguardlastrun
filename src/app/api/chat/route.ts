import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import connectToDatabase from '@/lib/db';
import Product from '@/models/Product';

const apiKey = process.env.GEMINI_API_KEY || "";

// 🌐 Language mapping
const languageMap: Record<string, string> = {
    en: "English",
    hi: "Hindi",
    bn: "Bengali",
    ur: "Urdu"
};

export async function POST(req: Request) {
    try {
        const { message, language = "en", pdfDataArray } = await req.json();

        const selectedLanguage = languageMap[language] || "English";

        await connectToDatabase();
        const products = await Product.find({}).lean();

        const productListString = products.length
            ? products.map(p => `${p.name} (${p.weight}) - ₹${p.price}`).join(', ')
            : "Vermi compost, NPK, Neem Cake, and more";

        // 🔁 OFFLINE FALLBACK (SMART + MULTILINGUAL)
        if (!apiKey) {
            const lowerMsg = message.toLowerCase();
            let reply = "";

            const responses: any = {
                greeting: {
                    en: "Hello! I am Krishi Sathi (offline mode). Ask me about farming, soil, or products.",
                    hi: "नमस्ते! मैं कृषि साथी हूँ (ऑफलाइन मोड)। आप खेती, मिट्टी या उत्पादों के बारे में पूछ सकते हैं।",
                    bn: "নমস্কার! আমি কৃষি সাথী (অফলাইন মোড)। আপনি চাষ, মাটি বা পণ্যের বিষয়ে জিজ্ঞাসা করতে পারেন।",
                    ur: "السلام علیکم! میں کرشی ساتھی ہوں (آف لائن موڈ)۔ آپ زراعت یا مصنوعات کے بارے میں پوچھ سکتے ہیں۔"
                },
                npk: {
                    en: "NPK = Nitrogen, Phosphorus, Potassium. Essential nutrients for crops.",
                    hi: "NPK = नाइट्रोजन, फॉस्फोरस, पोटैशियम। ये फसलों के लिए जरूरी पोषक तत्व हैं।",
                    bn: "NPK = নাইট্রোজেন, ফসফরাস, পটাশিয়াম। এগুলো ফসলের জন্য জরুরি পুষ্টি উপাদান।",
                    ur: "NPK = نائٹروجن، فاسفورس، پوٹاشیم۔ یہ فصلوں کے لیے ضروری غذائی اجزاء ہیں۔"
                },
                soil: {
                    en: "Maintain soil like a moist sponge. Avoid overwatering.",
                    hi: "मिट्टी को नम रखें, लेकिन ज्यादा पानी न दें।",
                    bn: "মাটি আর্দ্র রাখুন, কিন্তু অতিরিক্ত জল দেবেন না।",
                    ur: "مٹی کو نم رکھیں لیکن زیادہ پانی نہ دیں۔"
                },
                products: {
                    en: `We sell: ${productListString}`,
                    hi: `हम ये बेचते हैं: ${productListString}`,
                    bn: `আমরা বিক্রি করি: ${productListString}`,
                    ur: `ہم فروخت کرتے ہیں: ${productListString}`
                }
            };

            if (lowerMsg.includes("hi") || lowerMsg.includes("hello") || lowerMsg.includes("namaskar")) {
                reply = responses.greeting[language];
            } else if (lowerMsg.includes("npk")) {
                reply = responses.npk[language];
            } else if (lowerMsg.includes("soil") || lowerMsg.includes("moisture")) {
                reply = responses.soil[language];
            } else if (lowerMsg.includes("product") || lowerMsg.includes("buy") || lowerMsg.includes("sell")) {
                reply = responses.products[language];
            } else {
                reply = {
                    en: `I understand your query: "${message}". Please connect API for advanced AI response.`,
                    hi: `मैं आपके प्रश्न को समझता हूँ: "${message}"। कृपया AI सक्षम करने के लिए API जोड़ें।`,
                    bn: `আমি আপনার প্রশ্ন বুঝেছি: "${message}"। সম্পূর্ণ AI ব্যবহারের জন্য API যোগ করুন।`,
                    ur: `میں آپ کے سوال کو سمجھتا ہوں: "${message}"۔ مکمل AI کے لیے API شامل کریں۔`
                }[language];
            }

            return NextResponse.json({ reply });
        }

        // 🤖 GEMINI AI MODE
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // 🧠 STRONG SYSTEM PROMPT (Responsible + Multilingual)
        const systemPrompt = `
You are "Krishi Sathi", a responsible and expert agricultural AI assistant.

RULES:
- Always respond in ${selectedLanguage}
- Be clear, practical, and farmer-friendly
- If multiple questions are asked, answer ALL
- Avoid harmful, unsafe, or misleading advice
- If unsure, say "I am not certain" instead of guessing

PRODUCT LIST:
${productListString}

GUIDELINES:
- Give actionable farming advice
- Keep answers simple but informative
- Encourage sustainable agriculture
- Do not hallucinate unknown facts

User Message:
${message}
`;

        let promptArgs: any[] = [systemPrompt];

        // 📄 PDF Handling
        if (pdfDataArray?.length) {
            pdfDataArray.forEach((pdf: { data: string }) => {
                promptArgs.push({
                    inlineData: {
                        data: pdf.data,
                        mimeType: "application/pdf"
                    }
                });
            });

            promptArgs.push(`
Analyze the PDF(s):
- Summarize key points
- Compare if multiple files
- Answer user's questions based on them
`);
        }

        const result = await model.generateContent(promptArgs);
        const response = await result.response;

        return NextResponse.json({
            reply: response.text()
        });

    } catch (error: any) {
        console.error("AI Error:", error);

        return NextResponse.json(
            {
                reply: "⚠️ Sorry, something went wrong. Please try again later."
            },
            { status: 500 }
        );
    }
}